import { useMemo, useState } from "react";
import { Sheet } from "@/components/sheet";
import { SearchField } from "@/components/search-field";
import { cx } from "@/components/cx";
import { CheckIcon, PlusIcon } from "@/components/icons";
import type { Person } from "../domain/profile";
import type { Menu, MenuDish } from "../domain/types";
import { filterDishes, groupDishes, noFilter } from "../domain/view";
import { certainAllergens, listPrice, toWhom } from "./journey";
import { DishBlurb } from "./dish-more";
import { BigButton } from "./journey-parts";

type Indexed = MenuDish & { index: number };

/**
 * "Lägg till åt Anna": the whole menu in groups with a search field. A tap on a row adds the dish at once (it never
 * replaces anything) and the sheet stays open for the next; "Klar" says how many were added. A dish with an allergen
 * of the person is a red row that needs a second tap, "Lägg till ändå".
 */
export function AddDishSheet({
  person,
  menu,
  has,
  onAdd,
  dismissed,
  onRestore,
  onClose,
}: {
  person: Person;
  menu: Menu;
  /** Whether the person has the dish already (the proposed one or one added): "Redan med", nothing is added twice. */
  has: (dishIndex: number) => boolean;
  onAdd: (dishIndex: number) => void;
  /** Whether the person took this proposal away: the row says so, and a tap puts it back among the proposals. */
  dismissed: (dishIndex: number) => boolean;
  onRestore: (dishIndex: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // The dishes added while the sheet is open (they say "Tillagd"; the ones from before say "Redan med").
  const [just, setJust] = useState<number[]>([]);
  // The ones among them that came back as proposals (they say "Tillbaka", not "Tillagd").
  const [back, setBack] = useState<number[]>([]);
  // The dish with an allergen that waits for its second tap.
  const [asking, setAsking] = useState<number | null>(null);
  const indexed = useMemo<Indexed[]>(() => menu.ratter.map((dish, index) => ({ ...dish, index })).filter((dish) => dish.grupp !== "Drycker"), [menu.ratter]);
  const groups = useMemo(() => groupDishes(filterDishes(indexed, { ...noFilter, query })), [indexed, query]);
  const name = toWhom(person);

  function tap(dish: Indexed, allergens: string[]) {
    if (has(dish.index) || just.includes(dish.index)) return;
    if (dismissed(dish.index)) {
      setJust((current) => [...current, dish.index]);
      setBack((current) => [...current, dish.index]);
      onRestore(dish.index);
      return;
    }
    if (allergens.length > 0 && asking !== dish.index) {
      setAsking(dish.index);
      return;
    }
    setAsking(null);
    setJust((current) => [...current, dish.index]);
    onAdd(dish.index);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Lägg till åt ${person.name}`}
      closeLabel="Klar"
      footer={
        <div className="flex flex-col gap-2 border-t border-hairline pt-2">
          <p role="status" data-testid="menu-add-count" className="text-center text-meta text-ink-2">
            {just.length === 0 ? "Tryck på en rätt för att lägga till den" : `${just.length} ${just.length === 1 ? "tillagd" : "tillagda"}`}
          </p>
          <BigButton onClick={onClose}>Klar</BigButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-2" data-testid="menu-add-dish-sheet">
        <SearchField label="Sök rätt" placeholder="Sök rätt" delayMs={0} onSearch={setQuery} />
        {groups.length === 0 ? <p className="text-body text-ink-2">Ingen rätt matchar sökningen.</p> : null}
        {groups.map(({ group, dishes }) => (
          <section key={group} aria-label={group} className="flex flex-col gap-1">
            <h3 className="text-meta font-semibold text-ink-3">{group}</h3>
            <ul className="flex flex-col rounded-xl bg-surface px-4 py-1">
              {dishes.map((dish) => {
                const allergens = certainAllergens(dish, person);
                const done = just.includes(dish.index);
                const had = !done && has(dish.index);
                const wasProposal = !done && !had && dismissed(dish.index);
                const cameBack = done && back.includes(dish.index);
                const price = listPrice(dish);
                const sure = asking === dish.index;
                return (
                  <li key={dish.index} data-testid="menu-add-row" className="border-t border-hairline first:border-t-0">
                    <button
                      type="button"
                      aria-label={
                        cameBack
                          ? `${dish.originalnamn}, tillbaka bland förslagen åt ${name}`
                          : done
                            ? `${dish.originalnamn}, tillagd åt ${name}`
                            : had
                              ? `${dish.originalnamn}, redan med`
                              : wasProposal
                                ? `Ta tillbaka ${dish.originalnamn} bland förslagen`
                                : `${sure ? "Lägg till ändå" : "Lägg till"} ${dish.originalnamn}`
                      }
                      aria-disabled={done || had}
                      onClick={() => tap(dish, allergens)}
                      className="flex min-h-[68px] w-full items-center gap-3 py-2 text-left"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-row-title font-semibold text-ink">{dish.originalnamn}</span>
                        <DishBlurb dish={dish} lines={2} />
                        {allergens.length > 0 ? (
                          <span data-testid="menu-add-allergy" className="mt-0.5 flex gap-2 text-meta leading-snug font-semibold text-danger">
                            <i aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-pill bg-danger" />
                            {`Innehåller ${allergens.join(", ")}`}
                          </span>
                        ) : null}
                        {wasProposal ? <span className="text-meta font-semibold text-ink-3">Förslag du tog bort</span> : null}
                        {price === "" ? <span className="text-meta text-ink-3">Pris saknas, räknas inte med</span> : null}
                      </span>
                      {price ? <span className="shrink-0 text-body text-ink-2">{price}</span> : null}
                      {done ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-pill bg-accent px-2.5 py-1.5 text-meta font-semibold text-on-accent">
                          <CheckIcon size={14} />
                          {cameBack ? "Tillbaka" : "Tillagd"}
                        </span>
                      ) : had ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-pill bg-fill px-2.5 py-1.5 text-meta font-semibold text-ink-2">
                          <CheckIcon size={14} />
                          Redan med
                        </span>
                      ) : wasProposal ? (
                        <span className="shrink-0 rounded-pill bg-fill px-3 py-2 text-meta font-semibold text-ink">Ta tillbaka</span>
                      ) : sure ? (
                        <span className="shrink-0 rounded-pill bg-danger-tint px-3 py-2 text-meta font-semibold text-danger">Lägg till ändå</span>
                      ) : (
                        <span aria-hidden="true" className={cx("flex size-10 shrink-0 items-center justify-center rounded-pill bg-fill text-ink")}>
                          <PlusIcon size={18} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
