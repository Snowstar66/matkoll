"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ComponentProps } from "react";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { useToast } from "@/components/toast";
import { WeekPicker } from "@/components/week-picker";
import { fail, type Result } from "@/lib/errors";
import { addedToWeekText, clampServings, onWeekLabel, weekOffsetLabel, type PlanRecipeRow } from "@/features/mealplan";
import { PlanRow } from "@/features/mealplan/ui/plan-row";
import type { OfferIdeasView, PlanOption } from "@/features/suggestions";
import { OfferIdeas } from "./offer-ideas";

type AddToWeek = (input: { recipeId: string; servings?: number; id: string; weekStart: string }) => Promise<Result<PlanRecipeRow>>;

/** One of the weeks the card can add to, with the day of each dish already on it, by recipe id. */
export type OfferWeek = { weekStart: string; offset: number; number: number; onWeek: Readonly<Record<string, number | null>> };

/** The week dishes go on unless the person picks another: next week. */
const defaultWeekOffset = 1;

/**
 * "Rätter med extrapris" at the top of the sheet Veckans erbjudanden: up to
 * three of the user's own dishes that use an offer, most saved first, with "+"
 * (first free day of the chosen week, next week at first, picked with a
 * three-way segment) or the day when the dish is already on that week. "Visa alla" opens Recept with the filter Erbjudanden. Under them
 * "Nya idéer" (OfferIdeas): the AI ideas prepared in the background and saved,
 * shown also when none of the user's dishes match.
 */
export function OfferDishesCard({
  dishes,
  weeks,
  addToWeek,
  searchIngredients,
  ideas,
  startIdeas,
  readIdeas,
}: {
  dishes: readonly PlanOption[];
  /** This week and the next two, each with the day (or `null`) of the recipes already on it. */
  weeks: readonly OfferWeek[];
  addToWeek: AddToWeek;
  searchIngredients: SearchIngredients;
  /** The saved "Nya idéer" as the server read it; `null` when they could not be read. */
  ideas: OfferIdeasView | null;
  startIdeas: ComponentProps<typeof OfferIdeas>["start"];
  readIdeas: ComponentProps<typeof OfferIdeas>["read"];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [offset, setOffset] = useState(defaultWeekOffset);
  const week = weeks.find((candidate) => candidate.offset === offset) ?? weeks[0];
  const weekStart = week?.weekStart ?? "";
  // What this card put on a week, by week and recipe id.
  const [days, setDays] = useState<Readonly<Record<string, Readonly<Record<string, number | null>>>>>({});
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const ids = useRef(new Map<string, string>());
  const placed = { ...week?.onWeek, ...days[weekStart] };

  async function add(option: PlanOption) {
    if (adding.has(option.id) || !week) return;
    const target = week;
    setAdding((current) => new Set(current).add(option.id));
    // A retry id belongs to one dish on one week.
    const key = `${target.weekStart}:${option.id}`;
    const id = ids.current.get(key) ?? crypto.randomUUID();
    ids.current.set(key, id);
    let result: Result<PlanRecipeRow>;
    try {
      result = await addToWeek({ recipeId: option.id, servings: clampServings(option.servings), id, weekStart: target.weekStart });
    } catch {
      result = fail("mealplan_add_failed");
    }
    setAdding((current) => {
      const next = new Set(current);
      next.delete(option.id);
      return next;
    });
    if (!result.ok) {
      showToast(result.error.message, { role: "alert" });
      return;
    }
    ids.current.delete(key);
    const weekday = result.data.weekday ?? null;
    setDays((current) => ({ ...current, [target.weekStart]: { ...current[target.weekStart], [option.id]: weekday } }));
    showToast(addedToWeekText(option.title, option.buyNames, weekday, target.offset > 0 ? weekOffsetLabel(target.offset).toLocaleLowerCase("sv-SE") : null));
    router.refresh();
  }

  return (
    <section aria-labelledby="offer-dishes-heading" data-testid="offer-dishes" className="flex flex-col gap-2.5 rounded-lg bg-mint/40 p-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="offer-dishes-heading" className="text-body font-semibold text-ink">
          Rätter med extrapris
        </h3>
        <p className="text-meta text-ink-2">Förslag för att varorna har extrapris den här veckan.</p>
      </div>
      {weeks.length > 0 ? <WeekPicker weeks={weeks} selected={week?.offset ?? offset} onSelect={setOffset} testId="offer-week" /> : null}
      {dishes.length > 0 ? (
      <ul aria-label="Rätter med extrapris" className="flex flex-col gap-2">
        {dishes.map((option) => (
          <PlanRow
            key={option.id}
            testId="offer-dish"
            title={option.title}
            imageUrl={option.imageUrl}
            meta=""
            deal={option.deal?.text ?? null}
            onWeekLabel={option.id in placed ? onWeekLabel(placed[option.id]) : undefined}
            onAdd={() => void add(option)}
            disabled={adding.has(option.id)}
          />
        ))}
      </ul>
      ) : null}
      {dishes.length > 0 ? (
        <Link href="/recept?filter=erbjudanden" data-testid="offer-dishes-all" className="flex min-h-11 items-center self-start text-control font-semibold text-accent underline underline-offset-2">
          Visa alla
        </Link>
      ) : null}
      <OfferIdeas initial={ideas} start={startIdeas} read={readIdeas} weekStart={weekStart} addToWeek={addToWeek} searchIngredients={searchIngredients} previewOutside />
    </section>
  );
}
