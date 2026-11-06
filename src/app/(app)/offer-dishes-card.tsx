"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { addedToWeekText, clampServings, onWeekLabel, type PlanRecipeRow } from "@/features/mealplan";
import { PlanRow } from "@/features/mealplan/ui/plan-row";
import type { PlanOption } from "@/features/suggestions";

type AddToWeek = (input: { recipeId: string; servings: number; id: string; weekStart: string }) => Promise<Result<PlanRecipeRow>>;

/**
 * "Rätter med extrapris" at the top of the sheet Veckans erbjudanden: up to
 * three of the user's own dishes that use an offer, most saved first, with "+"
 * (first free day of this week) or the day when the dish is already on the
 * week. "Visa alla" opens Recept with the filter Erbjudanden.
 */
export function OfferDishesCard({
  dishes,
  onWeek,
  weekStart,
  addToWeek,
}: {
  dishes: readonly PlanOption[];
  /** The day (or `null`) of each recipe already on this week, by recipe id. */
  onWeek: Readonly<Record<string, number | null>>;
  weekStart: string;
  addToWeek: AddToWeek;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [days, setDays] = useState<Readonly<Record<string, number | null>>>({});
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const ids = useRef(new Map<string, string>());
  const placed = { ...onWeek, ...days };

  async function add(option: PlanOption) {
    if (adding.has(option.id)) return;
    setAdding((current) => new Set(current).add(option.id));
    const id = ids.current.get(option.id) ?? crypto.randomUUID();
    ids.current.set(option.id, id);
    let result: Result<PlanRecipeRow>;
    try {
      result = await addToWeek({ recipeId: option.id, servings: clampServings(option.servings), id, weekStart });
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
    ids.current.delete(option.id);
    const weekday = result.data.weekday ?? null;
    setDays((current) => ({ ...current, [option.id]: weekday }));
    showToast(addedToWeekText(option.title, option.buy, weekday));
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
      <Link href="/recept?filter=erbjudanden" data-testid="offer-dishes-all" className="flex min-h-11 items-center self-start text-control font-semibold text-accent underline underline-offset-2">
        Visa alla
      </Link>
    </section>
  );
}
