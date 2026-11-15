"use client";

import { useState } from "react";
import { InfoIcon } from "@/components/icons";
import type { Result } from "@/lib/errors";
import { explainDish, type ExplainDishRequest } from "../actions/explain-dish";
import type { DishExplanation, Menu, MenuDish } from "../domain/types";
import { TextLink } from "./journey-parts";

// What a dish is, said in Swedish where a person chooses: the Swedish name under the printed one, the explanation
// (up to three lines) and, on a tap, "Mer om rätten": a longer text from one small AI call that is only made when asked
// for and then kept for the rest of the visit.

/** The Swedish name of the dish when it differs from the printed one (a Swedish menu has none). */
export function swedishName(dish: Pick<MenuDish, "originalnamn" | "svenskt_namn">): string | null {
  const name = dish.svenskt_namn?.trim() ?? "";
  if (name === "" || name.toLocaleLowerCase("sv-SE") === dish.originalnamn.trim().toLocaleLowerCase("sv-SE")) return null;
  return name;
}

/** The Swedish name and the explanation under a dish's name in a list or a card; `lines` says how many lines the explanation may take. */
export function DishBlurb({ dish, lines = 3 }: { dish: Pick<MenuDish, "originalnamn" | "svenskt_namn" | "forklaring">; lines?: 2 | 3 }) {
  const name = swedishName(dish);
  return (
    <>
      {name ? (
        <span data-testid="menu-dish-swedish" className="text-body font-medium text-ink">
          {name}
        </span>
      ) : null}
      {dish.forklaring ? (
        <span data-testid="menu-dish-explanation" className={lines === 2 ? "line-clamp-2 text-meta text-ink-2" : "line-clamp-3 text-meta text-ink-2"}>
          {dish.forklaring}
        </span>
      ) : null}
    </>
  );
}

type Explain = (input: ExplainDishRequest) => Promise<Result<DishExplanation>>;

const kept = new Map<string, DishExplanation>();
const keyOf = (menu: Pick<Menu, "restaurang">, dish: MenuDish) => `${menu.restaurang ?? ""}|${dish.originalnamn}`;

/** Forgets what was explained (a new menu, and the tests). */
export function forgetExplanations() {
  kept.clear();
}

/** "Mer om rätten": the button, and below it the longer text once it has come. Give it a `key` of the dish so a new dish starts again. */
export function MoreAboutDish({ dish, menu, explain = explainDish }: { dish: MenuDish; menu: Pick<Menu, "restaurang" | "sprak">; explain?: Explain }) {
  const key = keyOf(menu, dish);
  const [text, setText] = useState<DishExplanation | null>(() => kept.get(key) ?? null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function load() {
    setStatus("loading");
    try {
      const answer = await explain({ name: dish.originalnamn, language: menu.sprak, restaurant: menu.restaurang, summary: dish.forklaring, ingredients: dish.huvudingredienser });
      if (!answer.ok) return setStatus("error");
      kept.set(key, answer.data);
      setText(answer.data);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  if (text) {
    const name = swedishName(dish) === null && text.svenskt_namn !== "" ? text.svenskt_namn : null;
    return (
      <div data-testid="menu-dish-more" className="flex flex-col gap-2 rounded-xl bg-bg px-4 py-3">
        <span className="text-meta font-semibold text-ink-3">Mer om rätten</span>
        {name ? <p className="text-body font-medium text-ink">{name}</p> : null}
        {text.beskrivning ? <p className="text-body text-ink">{text.beskrivning}</p> : null}
        {text.smak_och_storlek ? <p className="text-body text-ink-2">{text.smak_och_storlek}</p> : null}
        {text.ursprung ? <p className="text-body text-ink-2">{text.ursprung}</p> : null}
        {text.osakert ? <p className="text-meta text-ink-3">{text.osakert}</p> : null}
        <p className="text-meta text-ink-3">AI:ns tolkning av vad rätten vanligen är. Restaurangen kan göra den annorlunda.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <TextLink data-testid="menu-dish-more-button" onClick={() => void load()} disabled={status === "loading"} className="-ml-3 gap-2 font-semibold text-accent">
        <InfoIcon size={18} />
        {status === "loading" ? "Hämtar mer om rätten …" : status === "error" ? "Försök igen" : "Mer om rätten"}
      </TextLink>
      {status === "error" ? (
        <p role="alert" className="text-meta text-ink-3">
          Det gick inte att hämta mer om rätten just nu.
        </p>
      ) : null}
    </div>
  );
}
