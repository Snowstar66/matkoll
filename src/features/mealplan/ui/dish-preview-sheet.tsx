"use client";

import Link from "next/link";
import { Button, buttonClasses } from "@/components/button";
import { PreferenceNotes } from "@/components/preference-notes";
import { RecipeImage } from "@/components/recipe-image";
import { Sheet } from "@/components/sheet";
import type { PlanOption } from "@/features/suggestions";
import { offerTagText } from "@/lib/offer-tag";
import { currentWeekStart } from "../domain/week";
import { menuFacts } from "../domain/menu-stats";

// The preview of a dish in "Lägg till nya rätter": a tap on the card opens it, so what the row cannot carry can be
// read before the dish is added: the time and portions, what is missing at home, every offer in full (the chips of the
// row are cut), the household's preferences and, with Visa hur ofta on, how often the dish has been on the menu. The
// ingredients are not here (that needs a read when it opens); "Öppna receptet" has them.

export type DishPreviewSheetProps = {
  /** The dish shown; `null` keeps the sheet closed. */
  option: PlanOption | null;
  onClose: () => void;
  /** "Lägg på veckan", or "Lägg på måndag" when a free day was tapped above (targetDayText). */
  addLabel: string;
  onAdd: (option: PlanOption) => void;
  adding?: boolean;
  /** Tillval "Visa hur ofta": the section "På menyn". */
  showHowOften: boolean;
};

export function DishPreviewSheet({ option, onClose, addLabel, onAdd, adding = false, showHowOften }: DishPreviewSheetProps) {
  const facts = option && showHowOften && option.stats ? menuFacts(option.stats, currentWeekStart()) : null;
  const allergies = option?.fit?.filter((note) => note.kind === "allergy") ?? [];
  const others = option?.fit?.filter((note) => note.kind !== "allergy") ?? [];
  return (
    <Sheet
      open={option !== null}
      onClose={onClose}
      title={option?.title ?? ""}
      closeLabel="Klar"
      footer={
        option ? (
          <div className="flex flex-col gap-1">
            <Button fullWidth disabled={adding} onClick={() => onAdd(option)} data-testid="dish-preview-add">
              {addLabel}
            </Button>
            <Link href={`/recept/${option.id}`} data-testid="dish-preview-open" className={buttonClasses("text", true)}>
              Öppna receptet
            </Link>
          </div>
        ) : null
      }
    >
      {option ? (
        <div data-testid="dish-preview" className="flex flex-col gap-4">
          {allergies.length > 0 ? (
            <div data-testid="dish-preview-allergy" className="rounded-lg border-2 border-danger px-3 py-2">
              <PreferenceNotes notes={allergies} />
            </div>
          ) : null}
          <RecipeImage src={option.imageUrl} dish={option.dish} title={option.title} artSize={72} className="h-40 w-full rounded-lg" />
          <p className="text-body text-ink-2">
            {[option.isFavorite ? "Favorit" : null, option.totalMinutes ? `${option.totalMinutes} min` : null, `${option.servings} ${option.servings === 1 ? "portion" : "portioner"}`].filter(Boolean).join(" · ")}
          </p>
          <p data-testid="dish-preview-buy" className="text-body text-ink">
            {option.buy === 0 ? "Allt finns hemma" : `Saknas hemma: ${option.buyNames.join(", ")}`}
          </p>
          {option.deal ? (
            <section aria-label="Erbjudanden" data-testid="dish-preview-offers" className="flex flex-col gap-1.5">
              <h3 className="text-section-label text-ink-2 uppercase">Erbjudanden</h3>
              <p className="text-body text-deal-ink">{option.deal.text}</p>
              <ul className="flex flex-col gap-1">
                {option.deal.tags.map((tag) => (
                  <li key={offerTagText(tag)} className="text-body text-ink">
                    {offerTagText(tag)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {others.length > 0 ? (
            <section aria-label="Hushållet" data-testid="dish-preview-fit" className="flex flex-col gap-1.5">
              <h3 className="text-section-label text-ink-2 uppercase">Hushållet</h3>
              <PreferenceNotes notes={others} />
            </section>
          ) : null}
          {facts ? (
            <section aria-label="På menyn" data-testid="dish-preview-menu" className="flex flex-col gap-1.5">
              <h3 className="text-section-label text-ink-2 uppercase">På menyn</h3>
              <ul className="flex flex-col gap-1">
                {facts.map((line) => (
                  <li key={line} className="text-body text-ink">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
