import Link from "next/link";
import { useId } from "react";
import { Button, buttonClasses } from "@/components/button";
import { cx } from "@/components/cx";
import { Notice } from "@/components/notice";
import { errorMessages } from "@/lib/errors";
import type { ShoppingLine } from "../domain/compute-list";
import {
  addProductChoiceText,
  changeProductChoiceText,
  noProductChoiceText,
  newTabText,
  noStoreText,
  openProductText,
  openSettingsText,
  productChoiceHeading,
  type ProductChoiceContext,
  productChoiceText,
  unlinkedCustomItemText,
  unreadableProductChoiceText,
} from "../domain/product-choice";

// The section Produktval in Listpostdetalj (FR-27, Story 7.2): the choice the
// selected store has for the line's catalog ingredient, or that it has none,
// with a button that asks the list to open the sheet Produktval in place of
// the detail (sheets never stack, UX-DR4). An own item counts with the link
// it is saved with, not one changed in its form and not yet saved.

export type ProductChoiceSectionProps = {
  /** A recipe line with a catalog ingredient, or an own item (linked or not). */
  line: Pick<ShoppingLine, "ingredientId" | "isCustom">;
  /** The store and its choices, as the list was read. */
  context: ProductChoiceContext;
  /** "Ange produktval" / "Ändra produktval": the list replaces the detail with the sheet. */
  onOpen: () => void;
  /** While the detail saves, the button waits. */
  disabled?: boolean;
  /**
   * Why the button waits, shown under it: "Spara varan först." while an own
   * item's form has unsaved changes, since the section shows its saved link.
   */
  blockedHint?: string;
};

/**
 * `<section>` with the heading "Produktval": the saved choice ("Arla
 * Matlagningsgrädde 15 % · 5 dl"), with "Öppna produkten" when it has a link
 * (a new tab; never fetched), and "Ändra produktval"; or "Inget produktval i
 * [butik]." and "Ange produktval". Without a selected store it points to
 * Inställningar; when the store or its choices could not be read, or the
 * ingredient's stored choice cannot be read, a Notice says so and there is
 * no button, so nothing is saved over it. An own item without a catalog
 * ingredient gets a sentence instead of the section.
 */
export function ProductChoiceSection({ line, context, onOpen, disabled = false, blockedHint }: ProductChoiceSectionProps) {
  const headingId = useId();
  const hintId = useId();
  const ingredientId = line.ingredientId;
  if (!ingredientId) {
    // Only an own item without a link reaches here: a choice needs a catalog ingredient (AD-6).
    return (
      <p data-testid="product-choice-unlinked" className="text-body text-ink-2">
        {unlinkedCustomItemText}
      </p>
    );
  }

  const { store, storeUnavailable, productChoices, productChoicesUnavailable, unreadableChoices } = context;
  const choice = store && !productChoicesUnavailable ? productChoices[ingredientId] : undefined;

  let body;
  if (storeUnavailable) {
    body = <Notice role="status">{errorMessages.settings_store_unavailable}</Notice>;
  } else if (!store) {
    body = (
      <div className="flex flex-col items-start gap-1">
        <p className="text-body text-ink-2">{noStoreText}</p>
        <Link href="/installningar/butiker" className={cx(buttonClasses("text"), "-ml-3")}>
          {openSettingsText}
        </Link>
      </div>
    );
  } else if (productChoicesUnavailable) {
    body = <Notice role="status">{errorMessages.shopping_product_choices_unavailable}</Notice>;
  } else if (unreadableChoices.includes(ingredientId)) {
    body = <Notice role="status">{unreadableProductChoiceText}</Notice>;
  } else {
    body = (
      <>
        {choice ? (
          <div className="flex flex-col items-start gap-1">
            <p data-testid="product-choice-text" className="text-body break-words text-ink">
              {productChoiceText(choice)}
            </p>
            {choice.url ? (
              <a
                href={choice.url}
                target="_blank"
                rel="noopener noreferrer"
                // The name says which product, and that it opens in a new tab; it starts with the visible text.
                aria-label={`${openProductText} ${choice.productName}${newTabText}`}
                className="inline-flex min-h-tap items-center text-body text-accent underline"
              >
                {openProductText}
                <span className="sr-only">{newTabText}</span>
              </a>
            ) : null}
          </div>
        ) : (
          <p data-testid="product-choice-text" className="text-body break-words text-ink-2">
            {noProductChoiceText(store.name)}
          </p>
        )}
        <Button
          variant="secondary"
          fullWidth
          aria-haspopup="dialog"
          disabled={disabled || blockedHint !== undefined}
          aria-describedby={blockedHint ? hintId : undefined}
          onClick={onOpen}
        >
          {choice ? changeProductChoiceText : addProductChoiceText}
        </Button>
        {blockedHint ? (
          <p id={hintId} className="text-meta text-ink-2">
            {blockedHint}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} data-testid="product-choice" className="flex flex-col gap-2">
      <h3 id={headingId} className="text-section-label text-ink-2">
        {productChoiceHeading}
      </h3>
      {body}
    </section>
  );
}
