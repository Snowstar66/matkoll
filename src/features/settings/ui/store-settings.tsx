"use client";

import { useRouter } from "next/navigation";
import { useId, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/button";
import { CheckIcon, InfoIcon, PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { selectStore } from "../actions/select-store";
import { offerSiteFor, offersLinkCardText, offersSiteName } from "../domain/offers-link";
import {
  basketLineText,
  compareStores,
  noAddressText,
  noOffersHint,
  noOffersTitle,
  noSelectedStoreHint,
  noSelectedStoreText,
  noStoresIntro,
  noStoresLines,
  noStoresTitle,
  selectedStoreText,
  storePurposeText,
  type Store,
  storeSavedText,
  storeSummaryText,
} from "../domain/store";
import { StoreSheet } from "./store-sheet";

export type StoreSettingsProps = {
  /** Every store of the user's, sorted with `compareStores` (the selected one first). */
  stores: readonly Store[];
};

const noSubscription = () => () => {};

/** False during server rendering and before hydration, true once React runs in the browser. */
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

function applySelection(stores: readonly Store[], selectedId: string): readonly Store[] {
  return stores.map((store) => ({ ...store, isSelected: store.id === selectedId })).sort(compareStores);
}

/** The heading "Butik", shared by the section and its error state. */
function SectionHeading({ id }: { id: string }) {
  return (
    // Story 14.7: the page's own heading says "Butiker", so this one is for screen readers only.
    <h2 id={id} className="sr-only">
      Butik
    </h2>
  );
}

/**
 * The section Butik when the stores cannot be read (`settings_store_unavailable`):
 * the heading and a Notice, while the recipe sites and "Logga ut" still work.
 */
export function StoreSettingsUnavailable() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeading id={headingId} />
      <Notice role="alert">{errorMessages.settings_store_unavailable}</Notice>
    </section>
  );
}

/**
 * Butik in Inställningar (FR-28, UX-DR16): a sentence on what the page is for,
 * the selected store as a card ("Din butik", "Vald", with what it controls),
 * the other stores under "Byt butik" as the same kind of card with
 * "Använd den här butiken", and "Lägg till butik". Every store card has one
 * "Ändra", at the top right. "Använd den här butiken" selects at once,
 * without a question, and the card follows optimistically until the server's
 * stores come back; it goes back with a Notice when the selection fails. One
 * selection at a time: every such button waits while one is saved. Buttons
 * wait for hydration, since they only work through React.
 */
export function StoreSettings({ stores }: StoreSettingsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const hydrated = useHydrated();
  const [shown, select] = useOptimistic(stores, applySelection);
  const [selecting, startSelecting] = useTransition();
  const [selectError, setSelectError] = useState<string | null>(null);
  // The store being changed is kept as the sheet opened with it, so a refresh
  // behind the sheet never turns Ändra butik into Ny butik.
  const [sheet, setSheet] = useState<{ open: boolean; session: number; store: Store | undefined }>({
    open: false,
    session: 0,
    store: undefined,
  });
  /** The latest store chosen with "Välj"; an answer for an earlier one changes nothing. */
  const latestChoice = useRef<string | null>(null);
  const headingId = useId();
  const othersId = useId();
  const cardHeading = useRef<HTMLHeadingElement>(null);

  const selected = shown.find((store) => store.isSelected) ?? null;
  // "Erbjudanden: ica.se" when the store has a link to its weekly offers (Story 9.1).
  const selectedOffersSite = selected?.offersUrl ? offersSiteName(selected.offersUrl) : null;
  const others = shown.filter((store) => !store.isSelected);
  // A store that went away elsewhere while its sheet is open: the sheet closes, there is nothing to change any more.
  const sheetStoreGone = sheet.store !== undefined && !stores.some((store) => store.id === sheet.store?.id);

  function openSheet(store: Store | undefined) {
    setSelectError(null);
    setSheet((current) => ({ open: true, session: current.session + 1, store }));
  }

  function choose(store: Store) {
    if (selecting) return;
    setSelectError(null);
    latestChoice.current = store.id;
    startSelecting(async () => {
      select(store.id);
      let result: Result<{ id: string }>;
      try {
        result = await selectStore({ id: store.id });
      } catch {
        result = fail("settings_save_failed");
      }
      if (latestChoice.current !== store.id) return;
      if (result.ok) {
        // The pressed button has left the list: focus goes to the card, which shows the store.
        cardHeading.current?.focus();
        showToast(selectedStoreText(store.name));
        return;
      }
      if (result.error.code !== "unauthorized") setSelectError(result.error.message);
      // Gone, or a selection that met another: the stores are read again.
      router.refresh();
    });
  }

  // The selected store's chain has an offer site, but no link is saved: the offers cannot be read yet.
  const missingOffersLink = selected !== null && !selected.offersUrl && offerSiteFor(selected.chain) !== undefined;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeading id={headingId} />
      {selectError ? <Notice role="alert">{selectError}</Notice> : null}
      {shown.length === 0 ? (
        <div data-testid="no-stores" className="flex flex-col gap-3 rounded-lg bg-surface p-4">
          <h3 className="text-row-title text-ink">{noStoresTitle}</h3>
          <p className="text-meta text-ink-2">{noStoresIntro}</p>
          <ul role="list" className="flex flex-col gap-2 text-body text-ink">
            {noStoresLines.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckIcon size={16} aria-hidden="true" className="mt-1 shrink-0 text-accent" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-body text-ink-2">{storePurposeText}</p>
      )}
      {selected ? (
        <div data-testid="selected-store" className="flex flex-col gap-1 rounded-lg border-2 border-accent bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-section-label text-ink-2">Din butik</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-badge font-semibold text-mint-ink">
              <CheckIcon size={12} aria-hidden="true" />
              Vald
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <h3 ref={cardHeading} tabIndex={-1} className="min-w-0 pt-2.5 text-row-title break-words text-ink">
              {selected.name}
            </h3>
            <Button variant="text" disabled={!hydrated} onClick={() => openSheet(selected)} className="-mr-3 shrink-0">
              Ändra
            </Button>
          </div>
          <p className="text-meta text-ink-2">{storeSummaryText(selected)}</p>
          <p className="text-body break-words text-ink">{selected.address ?? noAddressText}</p>
          <ul role="list" className="mt-2 flex flex-col gap-1.5 border-t border-hairline pt-3 text-meta text-ink-2">
            {selectedOffersSite ? (
              <li data-testid="store-offers-link" className="flex items-start gap-2">
                <CheckIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                {offersLinkCardText(selectedOffersSite)}
              </li>
            ) : null}
            <li className="flex items-start gap-2">
              <CheckIcon size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
              {basketLineText}
            </li>
          </ul>
          {missingOffersLink ? (
            <div
              data-testid="no-offers"
              className="mt-2 flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--warm)_20%,transparent)] p-3 text-meta text-ink"
            >
              <InfoIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <p className="min-w-0">
                <span className="font-semibold">{noOffersTitle}</span> {noOffersHint}{" "}
                <button
                  type="button"
                  disabled={!hydrated}
                  onClick={() => openSheet(selected)}
                  className="font-semibold text-accent underline underline-offset-2"
                >
                  Lägg till länk
                </button>
              </p>
            </div>
          ) : null}
        </div>
      ) : shown.length > 0 ? (
        <div data-testid="no-store" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
          <h3 className="text-row-title text-ink">{noSelectedStoreText}</h3>
          <p className="text-meta text-ink-2">{noSelectedStoreHint}</p>
        </div>
      ) : null}
      {others.length > 0 ? (
        <>
          <h3 id={othersId} className="pt-2 text-section-label text-ink-2">
            Byt butik
          </h3>
          <ul aria-labelledby={othersId} className="flex flex-col gap-3">
            {others.map((store) => (
              <li key={store.id} data-testid="other-store" className="flex flex-col gap-3 rounded-lg bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="pt-2.5 text-row-title break-words text-ink">{store.name}</span>
                    <span className="text-meta text-ink-2">{storeSummaryText(store)}</span>
                  </div>
                  <Button
                    variant="text"
                    aria-label={`Ändra ${store.name}`}
                    disabled={!hydrated}
                    onClick={() => openSheet(store)}
                    className="-mr-3 shrink-0"
                  >
                    Ändra
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  fullWidth
                  aria-label={`Använd ${store.name}`}
                  disabled={!hydrated || selecting}
                  onClick={() => choose(store)}
                  className="border border-border"
                >
                  Använd den här butiken
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Button
        variant={shown.length === 0 ? "primary" : "secondary"}
        fullWidth
        disabled={!hydrated}
        onClick={() => openSheet(undefined)}
        className={shown.length === 0 ? undefined : "border border-dashed border-border"}
      >
        <PlusIcon size={18} aria-hidden="true" />
        Lägg till butik
      </Button>
      <StoreSheet
        open={sheet.open && !sheetStoreGone}
        session={sheet.session}
        store={sheet.store}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
        onSaved={() => showToast(storeSavedText)}
      />
    </section>
  );
}
