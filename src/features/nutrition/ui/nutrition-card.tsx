"use client";

import { useState } from "react";
import { Badge } from "@/components/badges";
import { ChevronRightIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { NUTRITION_LICENSE_URL } from "../domain/groups";
import { assessKostrad, plateShares } from "../domain/kostrad";
import { type RecipeNutrition, roundedGrams, roundedKcal } from "../domain/recipe-nutrition";
import { coverageText, KOSTRAD_TAG_EXPLANATIONS, PLATE_PARTS, shareText } from "../domain/texts";
import { Plate, plateColors } from "./plate";
import { useNutritionOptions } from "./use-nutrition-options";

/**
 * The recipe's nutrition card (only with Tillval "Visa näring" on): the plate, up to two
 * kostråd tags and a colour legend, and with "Visa kcal" a line "ca 300 kcal per portion".
 * A tap opens the sheet "Näring". A recipe that can show neither a plate nor a tag shows
 * no card at all. Everything is per portion, so the chosen portions change nothing.
 */
export function NutritionCard({ recipeTitle, nutrition }: { recipeTitle: string; nutrition: RecipeNutrition }) {
  const { show, kcal } = useNutritionOptions();
  const [open, setOpen] = useState(false);
  if (!show) return null;
  const shares = plateShares(nutrition);
  const { tags } = assessKostrad(nutrition);
  if (!shares && tags.length === 0) return null;
  const { perServing, coverage } = nutrition;
  const showKcal = kcal && coverage.counted > 0;
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
        {shares ? <Plate shares={shares} size={56} /> : null}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          {showKcal ? (
            <span className="text-body text-ink" data-testid="nutrition-kcal">
              ca {roundedKcal(perServing.kcal)} kcal <span className="text-ink-2">per portion</span>
            </span>
          ) : null}
          {tags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5" data-testid="nutrition-tags">
              {tags.map((tag) => (
                <Badge key={tag} tone="mint">
                  {tag}
                </Badge>
              ))}
            </span>
          ) : null}
          {shares ? <Legend /> : null}
        </span>
        <ChevronRightIcon size={18} className="shrink-0 text-ink-3" />
      </button>
      <NutritionSheet open={open} onClose={() => setOpen(false)} recipeTitle={recipeTitle} nutrition={nutrition} showKcal={showKcal} />
    </>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-ink-2">
      {PLATE_PARTS.map((part) => (
        <span key={part.key} className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="size-2 rounded-full opacity-70" style={{ background: plateColors[part.key] }} />
          {part.legend}
        </span>
      ))}
    </span>
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
  const rows = [
    ["Energi", `ca ${roundedKcal(perServing.kcal)} kcal`],
    ["Protein", `${roundedGrams(perServing.proteinG)} g`],
    ["Fett", `${roundedGrams(perServing.fatG)} g`],
    ["Kolhydrater", `${roundedGrams(perServing.carbsG)} g`],
    ["Fiber", `${roundedGrams(perServing.fiberG)} g`],
  ] as const;
  return (
    <Sheet open={open} onClose={onClose} title="Näring" subtitle={`${recipeTitle}, per portion`} closeLabel="Klar">
      <div className="flex flex-col gap-3" data-testid="nutrition-sheet">
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
        {showKcal ? (
          <section aria-labelledby="nutrition-values-heading" className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-3">
            <h3 id="nutrition-values-heading" className="text-section-label text-ink-2">
              Per portion
            </h3>
            <dl className="flex flex-col divide-y divide-hairline">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 text-body text-ink">
                  <dt>{label}</dt>
                  <dd className="text-ink-2">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <p className="px-1 text-meta text-ink-2">
          {coverageText(coverage.counted, coverage.total)} Salt och kryddor räknas inte.
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
