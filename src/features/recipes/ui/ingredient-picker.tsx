"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { SearchField } from "@/components/search-field";
import { cleanIngredientText, normalizeIngredientText, type IngredientSearchHit } from "@/features/catalog";
import { fail, type AppError, type Result } from "@/lib/errors";

/** The catalog's searchIngredients Server Action, passed down from the page (AD-1). */
export type SearchIngredients = (query: string) => Promise<Result<IngredientSearchHit[]>>;

export type IngredientPickerProps = {
  /** The recipe line, as written, whose ingredient is being swapped. */
  originalText: string;
  searchIngredients: SearchIngredients;
  onChoose: (hit: IngredientSearchHit) => void;
  /** Use the typed name as a new ingredient (created only when the recipe is saved). */
  onNew: (name: string) => void;
  /** Back to the preview; also on Esc, which then does not close the sheet. */
  onCancel: () => void;
};

/** The answer for one query. */
type Answer = { query: string; hits: IngredientSearchHit[] } | { query: string; error: AppError };

/**
 * Byt ingrediens: searches the catalog by name and synonym while Pontus types.
 * Shown in place of the preview, inside the same sheet (sheets never stack).
 * Unless a hit has exactly the typed name, the name can be used for a new
 * ingredient.
 */
export function IngredientPicker({ originalText, searchIngredients, onChoose, onNew, onCancel }: IngredientPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Only the latest search may show its answer.
  const latest = useRef(0);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
  }, []);

  async function search(text: string) {
    const id = ++latest.current;
    setQuery(text);
    if (!text.trim()) {
      setAnswer(null);
      return;
    }
    let result: Result<IngredientSearchHit[]>;
    try {
      result = await searchIngredients(text);
    } catch {
      result = fail("catalog_unavailable");
    }
    if (id !== latest.current) return;
    setAnswer(result.ok ? { query: text, hits: result.data } : { query: text, error: result.error });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    // Esc leaves the search, not the whole sheet.
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  // Only what belongs to the query in the field is shown.
  const current = answer && answer.query === query ? answer : null;
  const hits = current && "hits" in current ? current.hits : null;
  const name = cleanIngredientText(query) || query.trim();
  const exact = hits?.some((hit) => normalizeIngredientText(hit.name) === normalizeIngredientText(name));

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-row-title text-ink">Byt ingrediens</h3>
        <Button variant="text" onClick={onCancel} className="-mr-3">
          Avbryt
        </Button>
      </div>
      <p className="text-meta text-ink-2">Receptraden: {originalText}</p>
      <SearchField label="Sök ingrediens" placeholder="Sök ingrediens" onSearch={search} />
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
      {hits && name && !exact ? (
        <Button variant="secondary" fullWidth onClick={() => onNew(name)}>
          Lägg till {name} som ny
        </Button>
      ) : null}
    </div>
  );
}
