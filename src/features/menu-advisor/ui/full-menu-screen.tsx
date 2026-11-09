import { useMemo, useState } from "react";
import { SearchField } from "@/components/search-field";
import { cx } from "@/components/cx";
import { Notice } from "@/components/notice";
import type { Person } from "../domain/profile";
import type { Menu, MenuDish } from "../domain/types";
import { menuReaderText, type MenuReader } from "../domain/reading";
import { unfitFor } from "../domain/people";
import { filterDishes, groupDishes, noFilter } from "../domain/view";
import { DishSheet } from "./dish-sheet";
import { listPrice } from "./journey";
import { BackLink, Headline, TextLink } from "./journey-parts";

type Indexed = MenuDish & { index: number };

/**
 * Step 5, "Hela menyn": the menu in groups (Förrätt, Varmrätt, Efterrätt, Drycker), name, price and a one-line
 * Swedish explanation, with a search field on top. A dish someone in the company cannot eat is toned with a red
 * dot and the name; nothing else is marked. A tap opens the dish in a sheet. In "Bara förklara" there is no company
 * and no mark.
 */
export function FullMenuScreen({
  menu,
  company,
  explain,
  forPerson,
  isStarred,
  tonightCount,
  reader,
  canReadCarefully,
  error,
  onAdd,
  onStar,
  onTonight,
  onCareful,
  onBack,
  onNext,
}: {
  menu: Menu;
  company: readonly Person[];
  explain: boolean;
  /** Opened from "Fler rätter åt Anna". */
  forPerson: Person | null;
  isStarred: (dish: MenuDish) => boolean;
  tonightCount: number;
  reader: MenuReader | null;
  canReadCarefully: boolean;
  error: string | null;
  onAdd: (personId: string, dishIndex: number) => void;
  onStar: (dish: MenuDish) => void;
  onTonight: () => void;
  onCareful: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const indexed = useMemo<Indexed[]>(() => menu.ratter.map((dish, index) => ({ ...dish, index })), [menu.ratter]);
  const groups = useMemo(() => groupDishes(filterDishes(indexed, { ...noFilter, query })), [indexed, query]);
  const shownCompany = explain ? [] : company;
  const openDish = open === null ? null : (menu.ratter[open] ?? null);
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="menu-full">
      <BackLink onClick={onBack} />
      <Headline sub={forPerson ? `Välj en rätt att lägga till åt ${forPerson.name === "Du" ? "dig" : forPerson.name}` : menu.restaurang ?? undefined}>Hela menyn</Headline>
      {error ? <Notice role="alert">{error}</Notice> : null}
      <SearchField label="Sök rätt" placeholder="Sök rätt" delayMs={0} onSearch={setQuery} />
      {groups.length === 0 ? <p className="text-body text-ink-2">Ingen rätt matchar sökningen.</p> : null}
      {groups.map(({ group, dishes }) => (
        <section key={group} aria-label={group} className="flex flex-col gap-2">
          <h3 className="px-1 text-headline font-bold text-ink">{group}</h3>
          <ul className="flex flex-col rounded-xl bg-surface px-4 py-1">
            {dishes.map((dish) => {
              const cannot = unfitFor(dish, shownCompany).filter((entry) => entry.hits.some((hit) => hit.source === "allergener"));
              const price = listPrice(dish);
              return (
                <li key={dish.index} className="border-t border-hairline first:border-t-0">
                  <button type="button" data-testid="menu-dish" onClick={() => setOpen(dish.index)} className="flex min-h-tap w-full items-start justify-between gap-3 py-3 text-left">
                    <span className={cx("flex min-w-0 flex-col", cannot.length > 0 && "opacity-60")}>
                      <span className="text-row-title font-semibold text-ink">{dish.originalnamn}</span>
                      {dish.forklaring ? <span className="line-clamp-1 text-meta text-ink-2">{dish.forklaring}</span> : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      {price ? <span className={cx("text-row-title font-semibold text-ink", cannot.length > 0 && "opacity-60")}>{price}</span> : null}
                      {cannot.length > 0 ? (
                        <span data-testid="menu-unfit" className="flex items-center gap-1.5 text-meta font-semibold text-danger">
                          <i aria-hidden="true" className="size-2 rounded-pill bg-danger" />
                          {cannot.map((entry) => entry.person.name).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
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
      <div className="flex flex-col items-center gap-1 pb-2 text-meta text-ink-3">
        {reader ? <p data-testid="menu-reader">{menuReaderText(reader)}</p> : null}
        <div className="flex flex-wrap justify-center">
          {canReadCarefully ? <TextLink onClick={onCareful} className="text-meta">Läs noggrannare</TextLink> : null}
          <TextLink onClick={onNext} className="text-meta">Fota nästa meny</TextLink>
          {tonightCount > 0 ? (
            <TextLink onClick={onTonight} data-testid="menu-tonight-open" className="text-meta">
              {`Ikväll (${tonightCount})`}
            </TextLink>
          ) : null}
        </div>
      </div>
      <DishSheet
        key={open ?? "none"}
        dish={openDish}
        company={shownCompany}
        fromPersonId={forPerson?.id ?? null}
        explain={explain}
        starred={openDish ? isStarred(openDish) : false}
        onAdd={(personId) => {
          if (open !== null) onAdd(personId, open);
          setOpen(null);
        }}
        onStar={() => openDish && onStar(openDish)}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
