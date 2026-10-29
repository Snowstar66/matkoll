"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { FilterPills } from "@/components/filter-pills";
import { Button, buttonClasses } from "@/components/button";
import { CheckCircle } from "@/components/check-circle";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type ErrorCode, type Result } from "@/lib/errors";
import { fetchStoreOffers, type FetchStoreOffersResult } from "../actions/fetch-store-offers";
import {
  addedToListText,
  addToListText,
  fetchedAtText,
  fetchingOffersText,
  noOffersText,
  offersCountWords,
  offersFetchedManyText,
  offersFetchedStoreText,
  offersFetchedText,
  offersSheetSubtitle,
  offersSkippedText,
  offerListItem,
  offersSummaryText,
  openOffersPageText,
  type StoreOffer,
} from "../domain/offer";
import { topDealPercent } from "../domain/offer-saving";
import { bestStoreLine, type BestStore } from "../domain/best-store";
import { storeBadgeText, storeBadgeTone, type StoreBadgeInfo } from "../domain/store-badge";
import { FetchOffersButton } from "./fetch-offers-button";
import { OffersList, StoreLabel } from "./offers-list";
import { SuggestFromOffersButton } from "./suggest-from-offers-button";

/** A store as the sheet needs it; the page reads it from settings. */
export type OffersStore = {
  id: string;
  name: string;
  /** The store's chain ("ICA", "Willys" ...): the badge's colour follows it. */
  chain: string;
  /** The saved link to the store's offer page, for "Öppna sidan"; `null` without one. */
  offersUrl: string | null;
  /** "ica.se" when the link is on an offer site, else `null` (fetching then says the site is not supported). */
  siteName: string | null;
  /** When the store's offers were last fetched from its link (ISO), or `null`. */
  fetchedAt: string | null;
};

/**
 * Story 9.12: what picking offers for the shopping list needs. The page
 * reads the current plan and what is on its list (shopping) and passes the
 * action, so this module never imports shopping (AD-1). `null` without a
 * current plan: the rows then have no checkbox.
 */
export type OffersListing = {
  planId: string;
  /** Ids of the offers already on the list. */
  onList: readonly string[];
  add: (input: {
    planId: string;
    items: { key: string; label: string; ingredientId: string | null }[];
  }) => Promise<Result<{ count: number }>>;
};

export type OffersSheetProps = {
  /** The user's stores (all of them; the sheet fetches from those with a link), the selected one first. Empty when there is none. */
  stores: readonly OffersStore[];
  /** Veckans erbjudanden for every store that has them (getActiveOffers), each with its `storeId`. */
  offers: readonly StoreOffer[];
  /** The week shown: the offers' week, else this week. */
  weekStart: string;
  /** The server's time when the page was read (ISO), so texts like "idag" are the same on server and client. */
  now: string;
  /** The offers could not be read. */
  unavailable: boolean;
  /** Picking offers for the shopping list (Story 9.12); absent or `null` shows the list only. */
  listing?: OffersListing | null;
  /** Story 9.14: the week's best store, counted by the page; `null` when it could not be, or fewer than two stores have offers. */
  best?: BestStore | null;
  /** Story 16.7: the ids of the offers that fit what Pontus cooks or has at home (same rule as `best`); their rows say "Passar dig". */
  fitIds?: readonly string[];
};

/** Story 9.11: the offers under their categories, or the best saving first. */
const sortOptions = [
  { value: "category", label: "Efter avdelning" },
  { value: "saving", label: "Bäst rabatt" },
] as const;

/** One store's answer in the last fetch. */
type StoreRun = { storeId: string; result: FetchStoreOffersResult; attempt: number };

const settingsActions = new Set<ErrorCode>(["offers_link_missing", "offers_link_unsupported", "offers_store_missing"]);
const pageActions = new Set<ErrorCode>([
  "offers_fetch_blocked",
  "offers_fetch_failed",
  "offers_page_changed",
  "offers_page_old",
  "offers_none",
]);

/** "Öppna inställningar", to the section Butik. */
function SettingsLink() {
  return (
    <Link href="/installningar" className={buttonClasses("text")}>
      Öppna inställningar
    </Link>
  );
}

/** "Öppna sidan": the store's own offer page in a new tab, where Pontus can look instead. */
function OpenPageLink({ href, text = "Öppna sidan" }: { href: string; text?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("text")}>
      {text}
      <span className="sr-only"> (öppnas i en ny flik)</span>
    </a>
  );
}

/**
 * Arket Veckans erbjudanden (FR-35, UX-DR19, UX-DR20, Stories 9.1 and 9.13):
 * the store and the week under the title; without offers "Inga erbjudanden
 * hämtade för vecka 44." and "Hämta veckans erbjudanden"; with them "7
 * erbjudanden · hämtade idag 07:12" and "Hämta igen", the offers under their
 * categories and last "Öppna sidan på ica.se". With several stores that have
 * a link there is a checkbox per store with "Hämta valda" and "Hämta alla",
 * a filter ("Alla" and a pill per store) and a badge on every row. Stores are
 * fetched one at a time, each with its own answer (a throttled or blocked
 * store does not stop the rest). A fetch shows "Hämtar erbjudandena från
 * ica.se …" while it runs, then a short confirmation and the line about what
 * was not food; an error shows in a notice with a way on ("Öppna sidan" or
 * "Öppna inställningar"), never a new try. Nothing is fetched without a tap.
 */
export function OffersSheet({
  open,
  onClose,
  stores,
  offers,
  weekStart,
  now,
  unavailable,
  listing = null,
  best = null,
  fitIds,
}: OffersSheetProps & { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<{ message: string; attempt: number } | null>(null);
  const [sort, setSort] = useState<"category" | "saving">("category");
  const [onlyBest, setOnlyBest] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  // The stores Pontus has unticked for "Hämta valda"; all are ticked by default.
  const [panel, setPanel] = useState<"fetch" | "filter" | null>(null);
  const [selecting, setSelecting] = useState(false);
  const fetchPanelId = useId();
  const filterPanelId = useId();
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [runs, setRuns] = useState<StoreRun[]>([]);
  const [progress, setProgress] = useState<{ store: OffersStore; at: number; of: number } | null>(null);
  const attempts = useRef(0);
  const pending = progress !== null;

  const withLink = useMemo(() => stores.filter((store) => store.offersUrl), [stores]);
  const many = withLink.length > 1;
  const badges = useMemo(
    () => new Map(stores.map((store) => [store.id, { text: storeBadgeText(store.name), tone: storeBadgeTone(store.chain) }])),
    [stores],
  );
  const filterId = storeFilter !== "all" && withLink.some((store) => store.id === storeFilter) ? storeFilter : "all";
  const fits = useMemo(() => new Set(fitIds ?? []), [fitIds]);
  const onList = useMemo(() => new Set([...(listing?.onList ?? []), ...added]), [listing, added]);
  const chosen = offers.filter((offer) => picked.has(offer.id) && !onList.has(offer.id));
  const storesWithOffers = useMemo(() => withLink.filter((store) => offers.some((offer) => offer.storeId === store.id)), [withLink, offers]);
  const bestInfo = storesWithOffers.length > 1 && best && storesWithOffers.some((store) => store.id === best.storeId) ? best : null;
  const matchIds = useMemo(() => new Set(bestInfo?.matches.map((match) => match.id) ?? []), [bestInfo]);
  const showingMatches = onlyBest && matchIds.size > 0;
  const shown = useMemo(() => {
    const ofStore = filterId === "all" ? offers : offers.filter((offer) => offer.storeId === filterId);
    return showingMatches ? ofStore.filter((offer) => matchIds.has(offer.id)) : ofStore;
  }, [offers, filterId, showingMatches, matchIds]);
  const ticked = withLink.filter((store) => !unticked.has(store.id));

  /** One store after the other, never at once: each is one request to the store's site, and its answer is kept. */
  async function fetchFrom(chosenStores: readonly OffersStore[]) {
    if (pending || chosenStores.length === 0) return;
    setPanel(null);
    setRuns([]);
    const done: StoreRun[] = [];
    for (const [index, store] of chosenStores.entries()) {
      setProgress({ store, at: index + 1, of: chosenStores.length });
      let answer: FetchStoreOffersResult;
      try {
        answer = await fetchStoreOffers({ storeId: store.id });
      } catch {
        // No answer (e.g. no connection): nothing was saved.
        answer = fail("offers_fetch_failed");
      }
      done.push({ storeId: store.id, result: answer, attempt: ++attempts.current });
      setRuns([...done]);
      if (!answer.ok && answer.error.code === "unauthorized") {
        router.refresh();
        break;
      }
    }
    setProgress(null);
    const saved = done.flatMap((run) => (run.result.ok ? [run.result.data] : []));
    if (saved.length > 0) {
      const count = saved.reduce((sum, data) => sum + data.saved, 0);
      showToast(
        chosenStores.length === 1 ? offersFetchedText(count, saved[0].weekStart) : offersFetchedManyText(count, saved.length, saved[0].weekStart),
      );
    }
  }

  async function addChosen() {
    if (!listing || chosen.length === 0 || adding) return;
    const items = chosen.map((offer) => offerListItem(offer, badges.get(offer.storeId)?.text));
    setAdding(true);
    setAddError(null);
    let answer: Awaited<ReturnType<OffersListing["add"]>>;
    try {
      answer = await listing.add({ planId: listing.planId, items });
    } catch {
      answer = fail("shopping_save_failed");
    }
    setAdding(false);
    if (answer.ok) {
      setAdded((before) => new Set([...before, ...chosen.map((offer) => offer.id)]));
      setPicked(new Set());
      setSelecting(false);
      // The sheet closes, so the toast and its link are within reach.
      onClose();
      showToast(addedToListText(chosen.length), {
        show: { label: "Inköpslista", onShow: () => router.push("/lista") },
      });
    } else {
      if (answer.error.code === "unauthorized" || answer.error.code === "shopping_plan_changed") router.refresh();
      setAddError({ message: answer.error.message, attempt: (addError?.attempt ?? 0) + 1 });
    }
  }

  const skipped = runs.reduce((sum, run) => sum + (run.result.ok ? run.result.data.skipped : 0), 0);
  const siteName = withLink[0]?.siteName ?? "ica.se";
  const lastFetch = shown.length > 0 ? latestFetch(filterId === "all" ? withLink : withLink.filter((store) => store.id === filterId)) : null;
  const single = withLink[0];

  let body: ReactNode;
  if (stores.length === 0) {
    body = <Notice action={<SettingsLink />}>{errorMessages.offers_store_missing}</Notice>;
  } else if (withLink.length === 0) {
    body = <Notice action={<SettingsLink />}>{errorMessages.offers_link_missing}</Notice>;
  } else if (unavailable) {
    body = <Notice role="alert">{errorMessages.offers_unavailable}</Notice>;
  } else {
    const fetchPanel = (
      <StoreFetchPanel
        stores={withLink}
        offers={offers}
        badges={badges}
        unticked={unticked}
        onToggle={(id, on) =>
          setUnticked((before) => {
            const next = new Set(before);
            if (on) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        now={now}
        pending={pending}
        ticked={ticked}
        onFetch={(list) => void fetchFrom(list)}
      />
    );
    const hasSaving = shown.some((offer) => offer.savingPercent !== null);
    const canFilter = many || hasSaving;
    const activeFilters = (sort !== "category" ? 1 : 0) + (filterId !== "all" ? 1 : 0);
    const tops = shown.filter((offer) => offer.savingPercent !== null && offer.savingPercent >= topDealPercent).length;
    body = (
      <div className="flex flex-col gap-4">
        {offers.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-body text-ink-2">{noOffersText(weekStart)}</p>
            {many ? fetchPanel : <FetchOffersButton onFetch={() => void fetchFrom(withLink)} variant="primary" pending={pending} />}
            <SuggestFromOffersButton hasOffers={false} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 text-meta text-ink-2">
              <p data-testid="offers-summary">{offersSummaryText(shown.length, lastFetch, new Date(now))}</p>
              {tops > 0 ? (
                <p data-testid="offers-finds" className="font-semibold">
                  <span aria-hidden="true">{"\u{1F525} "}</span>
                  {`${tops} Toppklipp`}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {many ? (
                  <Button
                    variant="secondary"
                    aria-expanded={panel === "fetch"}
                    aria-controls={fetchPanelId}
                    onClick={() => setPanel(panel === "fetch" ? null : "fetch")}
                  >
                    Hämta
                  </Button>
                ) : (
                  <FetchOffersButton onFetch={() => void fetchFrom(withLink)} variant="secondary" pending={pending} />
                )}
                {canFilter ? (
                  <Button
                    variant="secondary"
                    aria-expanded={panel === "filter"}
                    aria-controls={filterPanelId}
                    onClick={() => setPanel(panel === "filter" ? null : "filter")}
                  >
                    {activeFilters > 0 ? `Filter \u00B7 ${activeFilters}` : "Filter"}
                  </Button>
                ) : null}
                {listing ? (
                  <Button
                    variant="text"
                    className="ml-auto"
                    aria-pressed={selecting}
                    onClick={() => {
                      setSelecting(!selecting);
                      if (selecting) setPicked(new Set());
                    }}
                  >
                    {selecting ? "Klar" : "Välj"}
                  </Button>
                ) : null}
              </div>
              {many && panel === "fetch" ? <div id={fetchPanelId}>{fetchPanel}</div> : null}
              {panel === "filter" && canFilter ? (
                <div id={filterPanelId} className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="filter-panel">
                  {hasSaving ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-meta text-ink-2">Sortera</p>
                      <FilterPills label="Sortera erbjudandena" options={sortOptions} value={sort} onChange={setSort} />
                    </div>
                  ) : null}
                  {many ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-meta text-ink-2">Butik</p>
                      <FilterPills
                        label="Visa butik"
                        options={[{ value: "all", label: "Alla" }, ...withLink.map((store) => ({ value: store.id, label: badges.get(store.id)?.text ?? store.name }))]}
                        value={filterId}
                        onChange={setStoreFilter}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <SuggestFromOffersButton
              hasOffers
              onStarted={onClose}
              stores={storesWithOffers.map((store) => ({ id: store.id, label: badges.get(store.id)?.text ?? store.name }))}
              defaultStoreId={bestInfo?.storeId ?? storesWithOffers[0]?.id}
              bestLine={
                bestInfo ? (
                  <div data-testid="best-store" className="flex flex-col gap-1">
                    <p className="text-body text-ink">
                      <span className="font-semibold">Bäst denna vecka:</span>{" "}
                      {badges.get(bestInfo.storeId) ? <StoreLabel badge={badges.get(bestInfo.storeId)!} testId="best-store-label" /> : null}
                      {" \u2013 "}
                      <span className="text-ink-2">{bestStoreLine(bestInfo)}</span>
                    </p>
                    {matchIds.size > 0 ? (
                      <Button
                        variant="text"
                        className="self-start"
                        aria-pressed={showingMatches}
                        onClick={() => setOnlyBest(!showingMatches)}
                        data-testid="best-store-toggle"
                      >
                        {showingMatches ? "Visa alla" : "Visa"}
                      </Button>
                    ) : null}
                  </div>
                ) : undefined
              }
            />
            <OffersList
              offers={shown}
              weekStart={weekStart}
              sort={sort}
              badges={many ? badges : undefined}
              showStore={filterId === "all" && storesWithOffers.length > 1 && !showingMatches}
              fits={fits}
              selection={
                listing
                  ? {
                      picked,
                      onList,
                      selecting,
                      disabled: adding,
                      onToggle: (id, on) =>
                        setPicked((before) => {
                          const next = new Set(before);
                          if (on) next.add(id);
                          else next.delete(id);
                          return next;
                        }),
                    }
                  : undefined
              }
            />
          </>
        )}
        <div className="-ml-3 flex flex-col items-start">
          {withLink.map((store) => (
            <OpenPageLink
              key={store.id}
              href={store.offersUrl ?? ""}
              text={many ? `${openOffersPageText(store.siteName ?? "ica.se")}: ${badges.get(store.id)?.text}` : openOffersPageText(siteName)}
            />
          ))}
        </div>
      </div>
    );
  }

  const progressText = progress
    ? fetchingOffersText(progress.store.siteName ?? "ica.se", { store: badges.get(progress.store.id)?.text ?? progress.store.name, at: progress.at, of: progress.of })
    : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Veckans erbjudanden"
      subtitle={
        stores.length > 0
          ? offersSheetSubtitle(withLink.length > 1 ? `${withLink.length} butiker` : (single ?? stores[0]).name, weekStart)
          : undefined
      }
      preventClose={pending || adding}
      footer={
        chosen.length > 0 ? (
          <Button variant="primary" disabled={adding} onClick={addChosen} data-testid="add-offers-to-list">
            {addToListText(chosen.length)}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {skipped > 0 && !pending ? (
          <p data-testid="offers-skipped" className="-mt-2 text-meta text-ink-2">
            {offersSkippedText(skipped)}
          </p>
        ) : null}
        {/* Mounted empty, so the progress is announced when its text arrives. */}
        <div role="status" aria-live="polite" className="text-meta text-ink-2 empty:hidden" data-testid="offers-progress">
          {progressText}
        </div>
        {!pending
          ? runs.map((run) => {
              const store = stores.find((candidate) => candidate.id === run.storeId);
              if (!store) return null;
              const label = many ? `${badges.get(store.id)?.text}: ` : "";
              if (run.result.ok) {
                return many ? (
                  <p key={run.storeId} data-testid="offers-store-result" className="text-meta text-ink-2">
                    {label}
                    {offersFetchedStoreText(run.result.data.saved)}
                  </p>
                ) : null;
              }
              const error = run.result.error;
              return (
                <Notice
                  // A new element per failure, so the same message is announced again.
                  key={`${run.storeId}-${run.attempt}`}
                  role="alert"
                  action={
                    settingsActions.has(error.code) ? (
                      <SettingsLink />
                    ) : pageActions.has(error.code) && store.offersUrl ? (
                      <OpenPageLink href={store.offersUrl} />
                    ) : undefined
                  }
                >
                  {label}
                  {error.message}
                </Notice>
              );
            })
          : null}
        {addError ? (
          <Notice key={addError.attempt} role="alert">
            {addError.message}
          </Notice>
        ) : null}
        {body}
      </div>
    </Sheet>
  );
}

/** The newest fetch among the stores, or `null` when none has been fetched. */
function latestFetch(stores: readonly OffersStore[]): Date | null {
  const times = stores.flatMap((store) => (store.fetchedAt ? [new Date(store.fetchedAt).getTime()] : []));
  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

/**
 * Story 9.13: with several stores, a checkbox per store (all ticked at first)
 * and "Hämta valda" and "Hämta alla". Each store's line says its chain, how
 * many offers it has and when they were fetched. The checkboxes are
 * `CheckCircle`s with a 44 px tap area, named by the store.
 */
function StoreFetchPanel({
  stores,
  offers,
  badges,
  unticked,
  onToggle,
  now,
  pending,
  ticked,
  onFetch,
}: {
  stores: readonly OffersStore[];
  offers: readonly StoreOffer[];
  badges: ReadonlyMap<string, StoreBadgeInfo>;
  unticked: ReadonlySet<string>;
  onToggle: (storeId: string, on: boolean) => void;
  now: string;
  pending: boolean;
  ticked: readonly OffersStore[];
  onFetch: (stores: readonly OffersStore[]) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="store-fetch-panel">
      <h3 id={headingId} className="text-body font-semibold text-ink">
        Hämta från
      </h3>
      <ListGroup labelledBy={headingId}>
        {stores.map((store) => {
          const count = offers.filter((offer) => offer.storeId === store.id).length;
          const badge = badges.get(store.id);
          return (
            <ListRow
              key={store.id}
              title={store.name}
              meta={storeFetchLine(store, count, now)}
              leading={
                <CheckCircle
                  label={store.name}
                  checked={!unticked.has(store.id)}
                  disabled={pending}
                  onCheckedChange={(on) => onToggle(store.id, on)}
                />
              }
              trailing={badge ? <StoreLabel badge={badge} testId="fetch-store-label" /> : undefined}
              data-testid="store-fetch-row"
            />
          );
        })}
      </ListGroup>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={pending || ticked.length === 0}
          onClick={() => onFetch(ticked)}
          data-testid="fetch-selected"
        >
          {ticked.length > 0 ? `Hämta valda (${ticked.length})` : "Hämta valda"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => onFetch(stores)} data-testid="fetch-all">
          Hämta alla
        </Button>
      </div>
    </section>
  );
}

/** "ICA · 7 erbjudanden · hämtade idag 07:12", or "ICA · inga erbjudanden hämtade". */
function storeFetchLine(store: OffersStore, count: number, now: string): string {
  const fetched = store.fetchedAt ? fetchedAtText(new Date(store.fetchedAt), new Date(now)) : null;
  if (count === 0 && !fetched) return "Inga erbjudanden hämtade";
  return [offersCountWords(count), fetched].filter(Boolean).join(" · ");
}

/**
 * The text button "Erbjudanden" in Inköpslista's header, which opens the
 * sheet Veckans erbjudanden (Story 9.1). The page passes it to the header as
 * a slot, so the shopping list never imports the offers module (AD-1).
 */
export function OffersSheetButton(props: OffersSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="text" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Erbjudanden
      </Button>
      <OffersSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
