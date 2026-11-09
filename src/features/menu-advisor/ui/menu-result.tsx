"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Notice } from "@/components/notice";
import { SearchField } from "@/components/search-field";
import { CameraIcon } from "@/components/icons";
import { languageName } from "../domain/labels";
import { pickId, type TonightPick } from "../domain/tonight";
import type { MenuAllergen } from "../domain/types";
import { currencySymbols, dishSek, filterDishes, groupDishes, matchDish, noFilter, parseDislikes, type MenuMode, underSekLimit } from "../domain/view";
import type { MenuReading } from "../actions/read-menu";
import type { Person } from "../domain/profile";
import { MenuDishRow } from "./menu-dish-row";
import { Suggestions } from "./suggestions";

/**
 * What was read: the menu in groups with explanations and prices, search and three filters, and below it the
 * allergy note, "Läs noggrannare" and "Fota nästa meny". With 0 dishes only the tips for a better photo.
 */
export function MenuResult({
  reading,
  mode,
  avoid,
  dislikes,
  modeSegment,
  avoidPanel,
  disclaimer,
  error,
  tonight,
  people,
  onTonight,
  onCareful,
  onNext,
}: {
  reading: MenuReading;
  mode: MenuMode;
  avoid: MenuAllergen[];
  dislikes: string;
  modeSegment: ReactNode;
  avoidPanel: ReactNode;
  disclaimer: ReactNode;
  error: string | null;
  tonight: { picks: TonightPick[]; toggle: (pick: TonightPick) => void };
  /** Who to suggest for; empty hides "Förslag till sällskapet". */
  people: Person[];
  onTonight: () => void;
  onCareful: () => void;
  onNext: () => void;
}) {
  const { menu } = reading;
  const [filter, setFilter] = useState(noFilter);
  const shown = useMemo(() => filterDishes(menu.ratter, filter), [menu.ratter, filter]);
  const groups = useMemo(() => groupDishes(shown), [shown]);
  const avoided = useMemo(() => parseDislikes(dislikes), [dislikes]);
  const starred = new Set(tonight.picks.map((pick) => pick.id));
  const done = reading.quality === "careful";

  const next = (
    <Button variant="secondary" fullWidth onClick={onNext}>
      <CameraIcon size={20} />
      Fota nästa meny
    </Button>
  );

  if (menu.ratter.length === 0) {
    return (
      <div className="flex flex-col gap-4" data-testid="menu-empty">
        <div>
          <h2 className="text-section-title text-ink">Jag kunde inte läsa menyn</h2>
          <p className="mt-1 text-body text-ink-2">Det gick inte att hitta några rätter på fotot. Några tips:</p>
        </div>
        <ul className="list-disc rounded-lg bg-surface py-3 pr-4 pl-8 text-body text-ink-2">
          <li>Håll kameran rakt framför menyn</li>
          <li>Undvik blänk från lampor och glas</li>
          <li>Är menyn lång? Fota ett stycke i taget, en sida per foto</li>
        </ul>
        {error ? <Notice role="alert">{error}</Notice> : null}
        {!done ? (
          <Button variant="secondary" fullWidth onClick={onCareful}>
            Läs noggrannare
          </Button>
        ) : null}
        <Button fullWidth onClick={onNext}>
          <CameraIcon size={20} />
          Fota om
        </Button>
      </div>
    );
  }

  const symbols = currencySymbols(menu.ratter);
  const sub = [
    `Läste: ${languageName(menu.sprak)}`,
    `${menu.ratter.length} ${menu.ratter.length === 1 ? "rätt" : "rätter"}`,
    symbols.length > 0 && !(symbols.length === 1 && symbols[0] === "kr") ? `priser i ${symbols.join(", ")} (ca kr)` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4" data-testid="menu-result">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-section-title break-words text-ink">{menu.restaurang ?? (mode === "explain" ? "Menyn förklarad" : "Menyn")}</h2>
          <p className="text-meta text-ink-2">{sub}</p>
        </div>
        <Button variant="compact" data-testid="menu-tonight-open" onClick={onTonight} className="shrink-0">
          Ikväll ({tonight.picks.length})
        </Button>
      </div>
      {modeSegment}
      {avoidPanel}
      {error ? <Notice role="alert">{error}</Notice> : null}
      <SearchField label="Sök i menyn" placeholder="Sök i menyn" delayMs={0} onSearch={(query) => setFilter((current) => ({ ...current, query }))} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="group" aria-label="Filter">
        <Chip selected={filter.vegetarian} aria-pressed={filter.vegetarian} onClick={() => setFilter((f) => ({ ...f, vegetarian: !f.vegetarian }))}>
          Vegetariskt
        </Chip>
        <Chip selected={filter.noShellfish} aria-pressed={filter.noShellfish} onClick={() => setFilter((f) => ({ ...f, noShellfish: !f.noShellfish }))}>
          Utan skaldjur
        </Chip>
        <Chip
          selected={filter.underSek !== null}
          aria-pressed={filter.underSek !== null}
          onClick={() => setFilter((f) => ({ ...f, underSek: f.underSek === null ? underSekLimit : null }))}
        >
          {`Under ${underSekLimit} kr`}
        </Chip>
      </div>
      {groups.length === 0 ? <p className="text-body text-ink-2">Ingen rätt matchar. Ändra sökningen eller filtret.</p> : null}
      {groups.map(({ group, dishes }) => (
        <section key={group} aria-label={group}>
          <h3 className="mx-1 mb-2 text-section-label text-ink-2 uppercase">{group}</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg bg-surface">
            {dishes.map((dish) => {
              const id = pickId(menu.restaurang, dish.originalnamn);
              return (
                <MenuDishRow
                  key={`${dish.grupp}-${dish.originalnamn}`}
                  dish={dish}
                  match={mode === "help" ? matchDish(dish, avoid, avoided) : null}
                  starred={starred.has(id)}
                  onStar={() =>
                    tonight.toggle({ id, name: dish.originalnamn, explanation: dish.forklaring, restaurant: menu.restaurang, sek: dishSek(dish) })
                  }
                />
              );
            })}
          </ul>
        </section>
      ))}
      {menu.osakert.length > 0 ? (
        <p data-testid="menu-uncertain" className="text-meta text-ink-3">
          Osäkert läst: {menu.osakert.join("; ")}
        </p>
      ) : null}
      <Suggestions menu={menu} people={people} />
      {disclaimer}
      <div className="flex flex-col gap-2">
        {!done ? (
          <>
            <Button variant="secondary" fullWidth onClick={onCareful}>
              Läs noggrannare
            </Button>
            <p className="-mt-1 text-center text-meta text-ink-3">Tar längre tid och kostar lite mer.</p>
          </>
        ) : null}
        {next}
      </div>
    </div>
  );
}
