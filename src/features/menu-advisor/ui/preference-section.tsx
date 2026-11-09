"use client";

import { useId, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Input } from "@/components/field";
import { maxTagLength } from "../domain/preferences";

/**
 * One free-text list in a profile ("Undviker" or "Älskar"): a field to add to, the added ones as chips that are
 * removed with a tap, and a row of suggestions (those already added are left out). Tags are always shown as text.
 */
export function PreferenceSection({
  title,
  hint,
  inputLabel,
  tags,
  suggestions,
  onAdd,
  onRemove,
  testId,
}: {
  title: string;
  hint: string;
  inputLabel: string;
  tags: readonly string[];
  suggestions: readonly string[];
  /** Returns an error text when the tag was not added. */
  onAdd: (text: string) => string | null;
  onRemove: (tag: string) => void;
  testId: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const taken = new Set(tags.map((tag) => tag.toLocaleLowerCase("sv-SE")));
  const open = suggestions.filter((tag) => !taken.has(tag.toLocaleLowerCase("sv-SE")));

  function add(value: string) {
    const failed = onAdd(value);
    setError(failed);
    if (failed === null) setText("");
  }

  return (
    <section aria-labelledby={`${id}-title`} data-testid={testId} className="flex flex-col gap-2">
      <div>
        <h3 id={`${id}-title`} className="text-section-label text-ink-2 uppercase">
          {title}
        </h3>
        <p className="text-meta text-ink-3">{hint}</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add(text);
        }}
      >
        <Input
          aria-label={inputLabel}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          data-testid={`${testId}-input`}
          value={text}
          // A little over the limit can be typed, so that "too long" is said instead of the text being cut silently.
          maxLength={maxTagLength + 20}
          enterKeyHint="done"
          placeholder={inputLabel}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
        />
        <Button type="submit" variant="secondary" className="shrink-0 whitespace-nowrap" disabled={text.trim() === ""}>
          Lägg till
        </Button>
      </form>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-meta text-danger">
          {error}
        </p>
      ) : null}
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-x-2 gap-y-3" aria-label={`${title}, tillagda`}>
          {tags.map((tag) => (
            <li key={tag}>
              <Chip selected icon="✕" aria-label={`Ta bort ${tag}`} onClick={() => onRemove(tag)}>
                {tag}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
      {open.length > 0 ? (
        <div className="flex flex-wrap gap-x-2 gap-y-3" role="group" aria-label={`Förslag: ${title.toLowerCase()}`}>
          {open.map((tag) => (
            <Chip key={tag} selected={false} icon="+" aria-label={`Lägg till ${tag}`} onClick={() => add(tag)}>
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}
    </section>
  );
}
