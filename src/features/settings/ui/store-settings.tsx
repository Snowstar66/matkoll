"use client";

import { useRouter } from "next/navigation";
import { useId, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { selectStore } from "../actions/select-store";
import { offersLinkCardText, offersSiteName } from "../domain/offers-link";
import {
  compareStores,
  noAddressText,
  noSelectedStoreText,
  selectedStoreText,
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
    <h2 id={id} className="text-section-label text-ink-2">
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
 * Butik in Inställningar (FR-28, UX-DR16): the selected store as a card
 * (name, chain and store id, address and URL as a link) with "Ändra", the
 * other stores under "Andra butiker" with "Välj" each, and "Lägg till
 * butik". Every store has "Ändra". "Välj" selects at once, without a
 * question, and the card follows optimistically until the server's stores
 * come back; it goes back with a Notice when the selection fails. One
 * selection at a time: every "Välj" waits while one is saved. The URL opens
 * in a new tab and is never fetched. Buttons wait for hydration, since they
 * only work through React.
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

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeading id={headingId} />
      {selectError ? <Notice role="alert">{selectError}</Notice> : null}
      {selected ? (
        <div data-testid="selected-store" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 ref={cardHeading} tabIndex={-1} className="min-w-0 pt-2.5 text-row-title break-words text-ink">
              {selected.name}
            </h3>
            <Button
              variant="text"
              disabled={!hydrated}
              onClick={() => openSheet(selected)}
              className="-mr-3 shrink-0"
            >
              Ändra
            </Button>
          </div>
          <p className="text-meta text-ink-2">{storeSummaryText(selected)}</p>
          <p className="text-body break-words text-ink">{selected.address ?? noAddressText}</p>
          {selected.url ? (
            <a
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body break-all text-accent underline"
            >
              {selected.url}
            </a>
          ) : null}
          {selectedOffersSite ? (
            <p data-testid="store-offers-link" className="text-meta text-ink-2">
              {offersLinkCardText(selectedOffersSite)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-body text-ink-2">{noSelectedStoreText}</p>
      )}
      {others.length > 0 ? (
        <>
          <h3 id={othersId} className="pt-2 text-section-label text-ink-2">
            Andra butiker
          </h3>
          <ul aria-labelledby={othersId} className="flex flex-col rounded-lg bg-surface px-4">
            {others.map((store) => (
              <li
                key={store.id}
                data-testid="other-store"
                className="flex min-h-tap flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-body break-words text-ink">{store.name}</span>
                  <span className="text-meta text-ink-2">{storeSummaryText(store)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="text"
                    aria-label={`Ändra ${store.name}`}
                    disabled={!hydrated}
                    onClick={() => openSheet(store)}
                  >
                    Ändra
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={`Välj ${store.name}`}
                    disabled={!hydrated || selecting}
                    onClick={() => choose(store)}
                  >
                    Välj
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div>
        <Button variant="text" disabled={!hydrated} onClick={() => openSheet(undefined)} className="-ml-3">
          Lägg till butik
        </Button>
      </div>
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
