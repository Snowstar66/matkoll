"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { fail, type AppError, type Result } from "@/lib/errors";
import { Button } from "./button";
import { Notice } from "./notice";
import { SearchField } from "./search-field";

/** A catalog ingredient found by a search; a module may add what it needs (e.g. its location). */
export type IngredientHit = { id: string; name: string };

/**
 * Searches the catalog while Pontus types: the catalog's searchIngredients
 * Server Action passed down from a page, or a module's own search* action.
 */
export type SearchIngredients<Hit extends IngredientHit = IngredientHit> = (query: string) => Promise<Result<Hit[]>>;

export type IngredientPickerProps<Hit extends IngredientHit> = {
  searchIngredients: SearchIngredients<Hit>;
  onChoose: (hit: Hit) => void;
  /**
   * The name to offer as a new ingredient for the query and its hits, or
   * `null` for none (catalog.newIngredientName).
   */
  newName: (query: string, hits: readonly Hit[]) => string | null;
  /** Use the typed name as a new ingredient (created only when the form is saved, AD-6). */
  onNew: (name: string) => void;
  /** Leaves the search; also on Esc, which then does not close the sheet. Without it, Esc is the sheet's. */
  onCancel?: () => void;
  /** Shown above the search field, inside the picker (e.g. a heading with "Avbryt"). */
  header?: ReactNode;
  /** The search field's name for screen readers. */
  label?: string;
};

/** The answer for one query. */
type Answer<Hit> = { query: string; hits: Hit[] } | { query: string; error: AppError };

/**
 * Ingrediensväljare: searches the catalog by name and synonym while Pontus
 * types (Sökfält, 200 ms) and lists the hits; unless a hit has exactly the
 * typed name, "Lägg till … som ny" uses the name for a new ingredient. Only
 * the latest search shows its answer. The search field has focus from the
 * start. Shown in place of a form inside the same sheet (sheets never stack).
 */
export function IngredientPicker<Hit extends IngredientHit>({
  searchIngredients,
  onChoose,
  newName,
  onNew,
  onCancel,
  header,
  label = "Sök ingrediens",
}: IngredientPickerProps<Hit>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer<Hit> | null>(null);
  // Only the latest search may show its answer.
  const latest = useRef(0);

  useEffect(() => {
    // After the current commit: a sheet opening with the picker in it calls
    // showModal later in the same commit, which moves focus to its first control.
    let active = true;
    queueMicrotask(() => {
      if (active) rootRef.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
    });
    return () => {
      active = false;
    };
  }, []);

  async function search(text: string) {
    const id = ++latest.current;
    setQuery(text);
    if (!text.trim()) {
      setAnswer(null);
      return;
    }
    let result: Result<Hit[]>;
    try {
      result = await searchIngredients(text);
    } catch {
      result = fail("catalog_unavailable");
    }
    if (id !== latest.current) return;
    setAnswer(result.ok ? { query: text, hits: result.data } : { query: text, error: result.error });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !onCancel) return;
    // Esc leaves the search, not the whole sheet.
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  // Only what belongs to the query in the field is shown.
  const current = answer && answer.query === query ? answer : null;
  const hits = current && "hits" in current ? current.hits : null;
  const name = hits ? newName(query, hits) : null;

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className="flex flex-col gap-3">
      {header}
      <SearchField label={label} placeholder={label} onSearch={search} />
      {current && "error" in current ? <Notice role="alert">{current.error.message}</Notice> : null}
      {hits && hits.length > 0 ? (
        <ul aria-label="Träffar" className="flex flex-col">
          {hits.map((hit) => (
            <li key={hit.id} className="border-b border-hairline last:border-b-0">
              <button
                type="button"
                onClick={() => onChoose(hit)}
                className="flex min-h-tap w-full items-center rounded-sm px-1 text-left text-body text-ink"
              >
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hits && hits.length === 0 ? (
        <p role="status" className="text-body text-ink-2">
          Ingen ingrediens hittades.
        </p>
      ) : null}
      {name ? (
        <Button variant="secondary" fullWidth onClick={() => onNew(name)}>
          Lägg till {name} som ny
        </Button>
      ) : null}
    </div>
  );
}
