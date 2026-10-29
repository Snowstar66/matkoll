"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useId, useState } from "react";
import { Button, buttonClasses } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type ErrorCode } from "@/lib/errors";
import { fetchStoreOffers, type FetchStoreOffersResult } from "../actions/fetch-store-offers";
import {
  fetchingOffersText,
  noOffersText,
  offersFetchedText,
  offersSheetSubtitle,
  offersSkippedText,
  offersSummaryText,
  openOffersPageText,
  type StoreOffer,
} from "../domain/offer";
import { FetchOffersButton } from "./fetch-offers-button";
import { OffersList } from "./offers-list";
import { SuggestFromOffersButton } from "./suggest-from-offers-button";

/** The store as the sheet needs it; the page reads it from settings. */
export type OffersStore = {
  id: string;
  name: string;
  /** The saved link to the store's offer page, for "Öppna sidan"; `null` without one. */
  offersUrl: string | null;
  /** "ica.se" when the link is on an offer site, else `null` (fetching then says the site is not supported). */
  siteName: string | null;
};

export type OffersSheetProps = {
  /** The selected store, or `null` when none is selected. */
  store: OffersStore | null;
  /** Veckans erbjudanden for the store (getActiveOffers). */
  offers: readonly StoreOffer[];
  /** The week shown: the offers' week, else this week. */
  weekStart: string;
  /** When the offers were last fetched from the link (ISO), or `null`. */
  fetchedAt: string | null;
  /** The server's time when the page was read (ISO), so texts like "idag" are the same on server and client. */
  now: string;
  /** The offers could not be read. */
  unavailable: boolean;
};

/** The last fetch's answer, and which tap it was, so a repeated failure is announced again. */
type FetchState = { result: FetchStoreOffersResult; attempt: number };

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
 * Arket Veckans erbjudanden (FR-35, UX-DR19, UX-DR20, Story 9.1): the
 * selected store and the week under the title; without offers "Inga
 * erbjudanden hämtade för vecka 44." and "Hämta veckans erbjudanden"; with
 * them "7 erbjudanden · hämtade idag 07:12" and "Hämta igen", the offers
 * under their categories and last "Öppna sidan på ica.se". A fetch shows
 * "Hämtar erbjudandena från ica.se …" while it runs, then the short
 * confirmation "Hämtade 7 erbjudanden för vecka 44." and the line about what
 * was not food; an error shows in a notice with a way on ("Öppna sidan" or
 * "Öppna inställningar"), never a new try. Nothing is fetched without a tap.
 */
export function OffersSheet({
  open,
  onClose,
  store,
  offers,
  weekStart,
  fetchedAt,
  now,
  unavailable,
}: OffersSheetProps & { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const formId = useId();
  const [state, fetchAction, pending] = useActionState<FetchState | null, FormData>(async (previous, formData) => {
    let answer: FetchStoreOffersResult;
    try {
      answer = await fetchStoreOffers({ storeId: String(formData.get("storeId") ?? "") });
    } catch {
      // No answer (e.g. no connection): nothing was saved.
      answer = fail("offers_fetch_failed");
    }
    if (answer.ok) showToast(offersFetchedText(answer.data.saved, answer.data.weekStart));
    else if (answer.error.code === "unauthorized") router.refresh();
    return { result: answer, attempt: (previous?.attempt ?? 0) + 1 };
  }, null);

  const result = state?.result ?? null;
  const error = result && !result.ok ? result.error : null;
  const skipped = result?.ok && result.data.skipped > 0 ? result.data.skipped : 0;
  const siteName = store?.siteName ?? "ica.se";

  let body: ReactNode;
  if (!store) {
    body = <Notice action={<SettingsLink />}>{errorMessages.offers_store_missing}</Notice>;
  } else if (!store.offersUrl) {
    body = <Notice action={<SettingsLink />}>{errorMessages.offers_link_missing}</Notice>;
  } else if (unavailable) {
    body = <Notice role="alert">{errorMessages.offers_unavailable}</Notice>;
  } else if (offers.length === 0) {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">{noOffersText(weekStart)}</p>
        <FetchOffersButton form={formId} variant="primary" pending={pending} />
        <SuggestFromOffersButton hasOffers={false} />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-x-3">
          <p data-testid="offers-summary" className="min-w-0 text-meta text-ink-2">
            {offersSummaryText(offers.length, fetchedAt ? new Date(fetchedAt) : null, new Date(now))}
          </p>
          <FetchOffersButton form={formId} variant="text" pending={pending} />
        </div>
        <SuggestFromOffersButton hasOffers onStarted={onClose} />
        <OffersList offers={offers} weekStart={weekStart} />
        <div className="-ml-3">
          <OpenPageLink href={store.offersUrl} text={openOffersPageText(siteName)} />
        </div>
      </div>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Veckans erbjudanden"
      subtitle={store ? offersSheetSubtitle(store.name, weekStart) : undefined}
      preventClose={pending}
    >
      <div className="flex flex-col gap-4">
        {skipped > 0 && !pending ? (
          <p data-testid="offers-skipped" className="-mt-2 text-meta text-ink-2">
            {offersSkippedText(skipped)}
          </p>
        ) : null}
        {/* Mounted empty, so the progress is announced when its text arrives. */}
        <div role="status" aria-live="polite" className="text-meta text-ink-2 empty:hidden" data-testid="offers-progress">
          {pending ? fetchingOffersText(siteName) : null}
        </div>
        {error && !pending ? (
          <Notice
            // A new element per failure, so the same message is announced again.
            key={state?.attempt}
            role="alert"
            action={
              settingsActions.has(error.code) ? (
                <SettingsLink />
              ) : pageActions.has(error.code) && store?.offersUrl ? (
                <OpenPageLink href={store.offersUrl} />
              ) : undefined
            }
          >
            {error.message}
          </Notice>
        ) : null}
        {body}
        {store ? (
          <form id={formId} action={fetchAction} className="hidden">
            <input type="hidden" name="storeId" value={store.id} />
          </form>
        ) : null}
      </div>
    </Sheet>
  );
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
