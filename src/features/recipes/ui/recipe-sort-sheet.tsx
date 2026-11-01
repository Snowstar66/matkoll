"use client";

import { CheckIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Sheet } from "@/components/sheet";
import { RECIPE_SORTS, recipeSortLabels, type RecipeSort } from "../domain/recipe-list";

/** What each sort does, under its name. */
const sortHints: Record<RecipeSort, string | undefined> = {
  newest: undefined,
  fastest: "kortast tid först",
  mostHome: "minst antal saknade varor först",
  alphabetical: undefined,
};

export type RecipeSortSheetProps = {
  open: boolean;
  onClose: () => void;
  value: RecipeSort;
  /** The sort chosen; the sheet closes after it. */
  onChange: (sort: RecipeSort) => void;
};

/** Arket "Sortera" (Story 1.16): the four sorts with a check at the chosen one; a choice applies at once and closes the sheet. */
export function RecipeSortSheet({ open, onClose, value, onChange }: RecipeSortSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Sortera" closeLabel="Klar" initialFocus="title">
      <ListGroup label="Sortering">
        {RECIPE_SORTS.map((sort) => (
          <ListRow
            key={sort}
            title={recipeSortLabels[sort]}
            meta={sortHints[sort]}
            srStatus={sort === value ? "vald" : undefined}
            trailing={sort === value ? <CheckIcon size={22} className="mx-2.5 text-accent" /> : undefined}
            onPress={() => {
              onChange(sort);
              onClose();
            }}
            pressProps={{ "data-testid": `sort-${sort}` }}
          />
        ))}
      </ListGroup>
    </Sheet>
  );
}
