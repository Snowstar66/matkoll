"use client";

import { useState } from "react";
import { Badge } from "@/components/badges";
import { ChevronRightIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { NUTRITION_LICENSE_URL } from "../domain/groups";
import { assessKostrad, plateShares, type PlateShares } from "../domain/kostrad";
import { BAR_MAX_SHARE, MEAL_REFERENCE, shareOfReference } from "../domain/reference";
import { nutritionSentence } from "../domain/sentence";
import { isTrustworthy, type RecipeNutrition, roundedGrams, roundedKcal } from "../domain/recipe-nutrition";
import { coverageText, KCAL_UNSURE_TEXT, REFERENCE_NOTE, KOSTRAD_TAG_EXPLANATIONS, PLATE_NOTE, PLATE_PARTS, negligibleText, portionEstimatesText, shareText, uncountedText, UNSURE_CARD_TEXT } from "../domain/texts";
import { Plate, plateColors } from "./plate";
import { useNutritionOptions } from "./use-nutrition-options";

/**
 * The recipe's nutrition card (only with Tillval "Visa näring" on): the plate, up to two
 * kostråd tags and a colour legend, and with "Visa kcal" a line "ca 300 kcal per portion".
 * A tap opens the sheet "Näring". A recipe with no plate and no tag still shows the kcal line when Visa kcal is
 * on and the numbers are trustworthy; with nothing at all to show there is no card. Everything is per portion, so the chosen portions change nothing.
 */
export function NutritionCard({ recipeTitle, nutrition }: { recipeTitle: string; nutrition: RecipeNutrition }) {
  const { show, kcal } = useNutritionOptions();
  const [open, setOpen] = useState(false);
  if (!show) return null;
  const shares = plateShares(nutrition);
  const { tags } = assessKostrad(nutrition);
  const { perServing, coverage } = nutrition;
  const unsure = coverage.total > 0 && !isTrustworthy(coverage);
  const showKcal = kcal && isTrustworthy(coverage);
  const sentence = nutritionSentence(nutrition);
  // Nothing to show: no plate, no tag, no warning and no kcal line (a baked good with Visa kcal on still gets its kcal).
  if (!shares && tags.length === 0 && !unsure && !showKcal) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Näring, visa detaljer"
        data-testid="nutrition-card"
        className="flex w-full items-center gap-3 rounded-lg bg-surface px-4 py-3 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          {showKcal ? (
            <span className="text-body text-ink-2" data-testid="nutrition-kcal">
              <b className="text-recipe-title text-ink">ca {roundedKcal(perServing.kcal)}</b> kcal per portion
            </span>
          ) : null}
          {sentence ? (
            <span className="text-body text-ink" data-testid="nutrition-sentence">
              {sentence}
            </span>
          ) : null}
          {unsure ? (
            <span className="text-body text-ink-2" data-testid="nutrition-card-unsure">
              {UNSURE_CARD_TEXT}
            </span>
          ) : null}
          {shares ? (
            <span className="flex items-center gap-3">
              <Plate shares={shares} size={64} />
              <Legend shares={shares} />
            </span>
          ) : (
            <span className="text-meta text-ink-3">Tryck för detaljer</span>
          )}
          {tags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5" data-testid="nutrition-tags">
              {tags.map((tag) => (
                <Badge key={tag} tone="mint">
                  {tag}
                </Badge>
              ))}
            </span>
          ) : null}
        </span>
        <ChevronRightIcon size={18} className="shrink-0 text-ink-3" />
      </button>
      <NutritionSheet open={open} onClose={() => setOpen(false)} recipeTitle={recipeTitle} nutrition={nutrition} showKcal={showKcal} />
    </>
  );
}

function Legend({ shares }: { shares: PlateShares }) {
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-0.5 text-meta text-ink-2">
      {PLATE_PARTS.map((part) => (
        <li key={part.key} className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full opacity-70" style={{ background: plateColors[part.key] }} />
          <span className="flex-1">{part.legend}</span>
          <span className="text-ink-3">{shareText(shares[part.key])}</span>
        </li>
      ))}
    </ul>
  );
}

const BARS = [
  { key: "proteinG", label: "Protein", reference: MEAL_REFERENCE.proteinG },
  { key: "fatG", label: "Fett", reference: MEAL_REFERENCE.fatG },
  { key: "carbsG", label: "Kolhydrater", reference: MEAL_REFERENCE.carbsG },
  { key: "fiberG", label: "Fiber", reference: MEAL_REFERENCE.fiberG },
] as const;

/** Four small bars against the per-meal riktvärde; a thin tick marks the riktvärde, values are in text. */
function ReferenceBars({ perServing }: { perServing: RecipeNutrition["perServing"] }) {
  const tick = (1 / BAR_MAX_SHARE) * 100;
  return (
    <ul className="flex flex-col gap-2.5" data-testid="nutrition-bars">
      {BARS.map(({ key, label, reference }) => {
        const share = shareOfReference(perServing[key], reference);
        const percent = Math.round(share * 100);
        return (
          <li
            key={key}
            className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2.5 text-meta"
            data-testid={`nutrition-bar-${key}`}
            aria-label={`${label}: ${roundedGrams(perServing[key])} gram, ${percent} procent av riktvärdet`}
          >
            <span className="text-ink-2">{label}</span>
            <span aria-hidden="true" className="relative h-2.5 rounded-full bg-fill">
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(share, BAR_MAX_SHARE) * tick}%` }} />
              <span className="absolute -inset-y-1 w-0.5 rounded-sm bg-ink-2" style={{ left: `${tick}%` }} />
            </span>
            <span className="flex flex-col items-end leading-tight">
              <b className="font-semibold text-ink">{roundedGrams(perServing[key])} g</b>
              <span className="text-ink-3">{percent} %</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NutritionSheet({
  open,
  onClose,
  recipeTitle,
  nutrition,
  showKcal,
}: {
  open: boolean;
  onClose: () => void;
  recipeTitle: string;
  nutrition: RecipeNutrition;
  showKcal: boolean;
}) {
  const shares = plateShares(nutrition);
  const { tags } = assessKostrad(nutrition);
  const { perServing, coverage } = nutrition;
  const trusted = isTrustworthy(coverage);
  const sentence = nutritionSentence(nutrition);
  const notCounted = uncountedText(nutrition.uncounted);
  const estimatedText = portionEstimatesText(nutrition.portionEstimates);
  const negligible = negligibleText(nutrition.negligible);
  return (
    <Sheet open={open} onClose={onClose} title="Näring" subtitle={`${recipeTitle}, per portion`} closeLabel="Klar">
      <div className="flex flex-col gap-3" data-testid="nutrition-sheet">
        {sentence ? (
          <p className="px-1 text-body text-ink" data-testid="nutrition-sheet-sentence">
            {sentence}
          </p>
        ) : null}
        {shares ? (
          <section aria-labelledby="nutrition-plate-heading" className="flex flex-col gap-2 rounded-lg bg-surface px-4 py-3">
            <h3 id="nutrition-plate-heading" className="text-section-label text-ink-2">
              Tallriken
            </h3>
            <div className="flex items-center gap-4">
              <Plate shares={shares} size={96} />
              <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                {PLATE_PARTS.map((part) => (
                  <li key={part.key} className="flex items-center gap-2 text-body text-ink">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full opacity-70" style={{ background: plateColors[part.key] }} />
                    <span className="flex-1">{part.label}</span>
                    <span className="text-ink-2">{shareText(shares[part.key])}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-meta text-ink-2">{PLATE_NOTE}</p>
          </section>
        ) : null}
        {tags.length > 0 ? (
          <section aria-labelledby="nutrition-tags-heading" className="flex flex-col gap-2 rounded-lg bg-surface px-4 py-3">
            <h3 id="nutrition-tags-heading" className="text-section-label text-ink-2">
              Märken
            </h3>
            <ul className="flex flex-col gap-2">
              {tags.map((tag) => (
                <li key={tag} className="flex flex-col items-start gap-1">
                  <Badge tone="mint">{tag}</Badge>
                  <span className="text-body text-ink-2">{KOSTRAD_TAG_EXPLANATIONS[tag]}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {showKcal && trusted ? (
          <section aria-labelledby="nutrition-values-heading" className="flex flex-col gap-2 rounded-lg bg-surface px-4 py-3">
            <h3 id="nutrition-values-heading" className="text-section-label text-ink-2">
              Per portion
            </h3>
            <p className="text-body text-ink" data-testid="nutrition-energy">
              <span>Energi</span>: ca {roundedKcal(perServing.kcal)} kcal
              <span className="block text-meta text-ink-2">{Math.round(shareOfReference(perServing.kcal, MEAL_REFERENCE.kcal) * 100)} % av en måltids riktvärde</span>
            </p>
            <ReferenceBars perServing={perServing} />
            <p className="text-meta text-ink-3">{REFERENCE_NOTE}</p>
          </section>
        ) : null}
        {!trusted ? (
          <p className="px-1 text-body text-ink-2" data-testid="nutrition-unsure">
            {KCAL_UNSURE_TEXT}
          </p>
        ) : null}
        <p className="px-1 text-meta text-ink-2">
          {coverageText(coverage.counted, coverage.total, coverage.estimated)} Salt och kryddor räknas inte.
          {estimatedText ? <span data-testid="nutrition-portion-estimates"> {estimatedText}</span> : null}
          {negligible ? <span data-testid="nutrition-negligible"> {negligible}</span> : null}
          {notCounted ? <span data-testid="nutrition-uncounted"> {notCounted}</span> : null}
        </p>
        <p className="px-1 text-meta text-ink-3">
          Källa: Livsmedelsverkets livsmedelsdatabas (
          <a href={NUTRITION_LICENSE_URL} target="_blank" rel="noreferrer" className="underline">
            CC BY 4.0
          </a>
          ). Näringen är ungefärlig.
        </p>
      </div>
    </Sheet>
  );
}
