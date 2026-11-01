"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { FilterPills } from "@/components/filter-pills";
import { TagIcon } from "@/components/icons";
import { Segment } from "@/components/segment";
import { Button, buttonClasses } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type ErrorCode, type Result } from "@/lib/errors";
import { clearOtherStoreOffers } from "../actions/clear-other-store-offers";
import { fetchStoreOffers, type FetchStoreOffersResult } from "../actions/fetch-store-offers";
import {
  addedToListText,
  addToListText,
  fetchedAtText,
  fetchedLineText,
  fetchingOffersText,
  noOffersText,
  offersCountWords,
  offersFetchedManyText,
  offersFetchedStoreText,
  offersFetchedText,
  offersSheetSubtitle,
  offersSkippedText,
  offerListItem,
  offersMetaText,
  openOffersPageText,
  type StoreOffer,
} from "../domain/offer";
import { topDealPercent } from "../domain/offer-saving";
import { bestStoreTip, type BestStore } from "../domain/best-store";
import { storeBadgeText, storeBadgeTone, type StoreBadgeInfo } from "../domain/store-badge";
import { FetchOffersButton, inlineLinkClasses } from "./fetch-offers-button";
import { OffersList, StoreLabel } from "./offers-list";
import { StoreChoice, SuggestFromOffersButton } from "./suggest-from-offers-button";

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
 * action, so this module never imports shopping (AD-1). `planId` is not
 * needed to add (own items belong to the household, Story 17.10).
 */
export type OffersListing = {
  planId: string | null;
  /** Ids of the offers already on the list. */
  onList: readonly string[];
  add: (input: {
    planId?: string | null;
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
  /** Story 9.14: the week's best store, counted by the page; `null` when it could not be. With one store only its matches are named (Story 16.10). */
  best?: BestStore | null;
  /** Story 16.7: the ids of the offers that fit what Pontus cooks or has at home (same rule as `best`); their rows say "Passar dig". */
  fitIds?: readonly string[];
};

/** Story 9.11: the offers under their categories, or the best saving first. */
const sortOptions = [
  { value: "category", label: "Avdelning" },
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
    <Link href="/installningar/butiker" className={buttonClasses("text")}>
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
  const [storeFilter, setStoreFilter] = useState<string>("all");
  // The stores Pontus has unticked for "Hämta valda"; all are ticked by default.
  const [panel, setPanel] = useState<"fetch" | null>(null);
  // Story 16.10: "Föreslå rätter från vilken butik?" replaces the list inside the same sheet (sheets never stack).
  const [choosing, setChoosing] = useState(false);
  const fetchPanelId = useId();
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
  const storesWithOffers = useMemo(() => withLink.filter((store) => offers.some((offer) => offer.storeId === store.id)), [withLink, offers]);
  // Story 16.8: a store that no longer has offers (a fetch replaced them) cannot stay chosen.
  const filterId = storeFilter !== "all" && storesWithOffers.some((store) => store.id === storeFilter) ? storeFilter : "all";
  const fits = useMemo(() => new Set(fitIds ?? []), [fitIds]);
  const onList = useMemo(() => new Set([...(listing?.onList ?? []), ...added]), [listing, added]);
  const chosen = offers.filter((offer) => picked.has(offer.id) && !onList.has(offer.id));
  const bestInfo = best && storesWithOffers.some((store) => store.id === best.storeId) ? best : null;
  const matchIds = useMemo(() => new Set(bestInfo?.matches.map((match) => match.id) ?? []), [bestInfo]);
  const shown = useMemo(() => {
    return filterId === "all" ? offers : offers.filter((offer) => offer.storeId === filterId);
  }, [offers, filterId]);
  const ticked = withLink.filter((store) => !unticked.has(store.id));

  /** One store after the other, never at once: each is one request to the store's site, and its answer is kept. */
  async function fetchFrom(chosenStores: readonly OffersStore[], replaceOthers = false) {
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
    // Story 16.8: a selection replaces the other stores' offers, but only once one of its fetches worked.
    if (replaceOthers && done.some((run) => run.result.ok)) {
      try {
        await clearOtherStoreOffers({ keep: chosenStores.map((store) => store.id) });
      } catch {
        // The offers of the other stores stay; the next fetch tries again.
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
  const lastFetch = latestFetch(withLink);
  const single = withLink[0];

  let body: ReactNode;
  if (choosing && storesWithOffers.length > 1) {
    body = (
      <StoreChoice
        stores={storesWithOffers.map((store) => ({ id: store.id, label: badges.get(store.id)?.text ?? store.name }))}
        defaultStoreId={bestInfo?.storeId ?? storesWithOffers[0].id}
        bestStoreId={bestInfo?.storeId}
        onStarted={() => {
          setChoosing(false);
          onClose();
        }}
      />
    );
  } else if (stores.length === 0) {
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
        onFetch={(list) => void fetchFrom(list, list.length < withLink.length)}
      />
    );
    const hasSaving = offers.some((offer) => offer.savingPercent !== null);
    const filterStores = storesWithOffers.length > 1;
    const tops = offers.filter((offer) => offer.savingPercent !== null && offer.savingPercent >= topDealPercent).length;
    const tip = bestInfo && (filterStores || matchIds.size > 0)
      ? bestStoreTip(bestInfo, filterStores ? (badges.get(bestInfo.storeId)?.text ?? undefined) : undefined)
      : null;
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
            {/* Story 16.11: the top in groups of 16 px: header group, divider, inspiration card, divider, controls, then the list under its own header row. */}
            <div className="flex flex-col gap-1" data-testid="offers-header-group">
              <p data-testid="offers-meta" className="text-meta text-ink-2">
                {offersMetaText({ stores: many ? `${withLink.length} butiker` : (single ?? stores[0]).name, weekStart, count: offers.length })}
                {tops > 0 ? (
                  <>
                    {" · "}
                    <span data-testid="offers-finds" className="font-medium">
                      <span aria-hidden="true">{"\u{1F525} "}</span>
                      {`${tops} Toppklipp`}
                    </span>
                  </>
                ) : null}
              </p>
              <p data-testid="offers-fetched" className="text-meta text-ink-2">
                {lastFetch ? `${fetchedLineText(lastFetch, new Date(now))} · ` : null}
                {many ? (
                  <button
                    type="button"
                    className={inlineLinkClasses}
                    aria-expanded={panel === "fetch"}
                    aria-controls={fetchPanelId}
                    onClick={() => setPanel(panel === "fetch" ? null : "fetch")}
                  >
                    Hämta igen
                  </button>
                ) : (
                  <FetchOffersButton onFetch={() => void fetchFrom(withLink)} variant="link" pending={pending} />
                )}
              </p>
            </div>
            {many && panel === "fetch" ? <div id={fetchPanelId}>{fetchPanel}</div> : null}
            <hr className="m-0 border-border" />
            <div data-testid="inspiration" className="flex flex-col gap-3 rounded-lg bg-mint/40 p-4">
              {tip ? (
                <div data-testid="best-store" className="flex items-start gap-2 text-body text-ink">
                  <span aria-hidden="true">{"\u{1F4A1}"}</span>
                  <p className="min-w-0">{tip}</p>
                </div>
              ) : null}
              <div className="flex justify-end">
                <SuggestFromOffersButton
                  hasOffers
                  className="shrink-0"
                  onStarted={onClose}
                  onChoose={filterStores ? () => setChoosing(true) : undefined}
                />
              </div>
            </div>
            <hr className="m-0 border-border" />
            {filterStores || hasSaving ? (
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2" data-testid="list-filters">
                {filterStores ? (
                  <>
                    <span aria-hidden="true" className="text-meta text-ink-2">
                      Visa butik
                    </span>
                    <FilterPills
                      compact
                      label="Visa butik"
                      options={[{ value: "all", label: "Alla" }, ...storesWithOffers.map((store) => ({ value: store.id, label: badges.get(store.id)?.text ?? store.name }))]}
                      value={filterId}
                      onChange={setStoreFilter}
                      className="justify-self-start"
                    />
                  </>
                ) : null}
                {hasSaving ? (
                  <>
                    <span aria-hidden="true" className="text-meta text-ink-2">
                      Sortera
                    </span>
                    <Segment label="Sortera" options={sortOptions} value={sort} onChange={setSort} className="justify-self-start" />
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col">
              <div className="flex min-h-tap items-center border-b border-border">
                <p data-testid="offers-summary" className="text-meta text-ink-2">
                  {offersCountWords(shown.length)}
                </p>
              </div>
              <div className="pt-4">
                <OffersList
                  offers={shown}
                  weekStart={weekStart}
                  sort={sort}
                  badges={many ? badges : undefined}
                  showStore={filterId === "all" && storesWithOffers.length > 1}
                  fits={fits}
                  selection={
                    listing
                      ? {
                          picked,
                          onList,
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
              </div>
            </div>
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
      onClose={choosing ? () => setChoosing(false) : onClose}
      title={choosing ? "Föreslå rätter från vilken butik?" : "Veckans erbjudanden"}
      closeLabel="Klar"
      onBack={choosing ? () => setChoosing(false) : undefined}
      subtitle={
        // With offers the meta line in the body says store, week and count (Story 16.11).
        stores.length > 0 && !choosing && offers.length === 0
          ? offersSheetSubtitle(withLink.length > 1 ? `${withLink.length} butiker` : (single ?? stores[0]).name, weekStart)
          : undefined
      }
      preventClose={pending || adding}
      initialFocus="title"
      footer={
        chosen.length > 0 && !choosing ? (
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
 * `Checkbox`es with a 44 px tap area, named by the store.
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
                <Checkbox
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
 * The icon button "Erbjudanden" (a price tag) in Inköpslista's header, which opens the
 * sheet Veckans erbjudanden (Story 9.1). The page passes it to the header as
 * a slot, so the shopping list never imports the offers module (AD-1).
 */
export function OffersSheetButton(props: OffersSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Story 19.2: an icon button like the "+" of the other tabs, named for screen readers. */}
      <button
        type="button"
        aria-label="Erbjudanden"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex size-tap items-center justify-center rounded-full text-ink-2"
      >
        <TagIcon size={24} />
      </button>
      <OffersSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
