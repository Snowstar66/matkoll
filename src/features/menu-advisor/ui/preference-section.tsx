"use client";

import { useId, useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/field";
import { ChevronRightIcon } from "@/components/icons";
import { cx } from "@/components/cx";
import { maxTagLength } from "../domain/preferences";
import type { Person, Taste } from "../domain/profile";
import { ownGroup, ownKeys, tasteGroups, tasteLabel, tasteSummary, validateOwnTaste, withTaste } from "../domain/tastes";
import { TasteSlider, tasteStepLabels } from "./taste-slider";

/**
 * Smak (Smak och allergier): everything a person likes or dislikes, one two-way slider per thing from Ogillar via Okej
 * to Älskar. The presets are in collapsible groups (the group row says how many are set, so the page is calm while
 * everything is Okej); the person's own things are a group of their own, added with a text field. Okej is never stored:
 * nothing filled in means the person eats anything.
 */
export function TasteSection({ person, onChange }: { person: Person; onChange: (person: Person) => void }) {
  const id = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(ownKeys(person.tastes).length > 0 ? [ownGroup.id] : []));
  // Own things added in this visit stay in the list while they are Okej (they are not stored then).
  const [added, setAdded] = useState<readonly string[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const own = ownKeys(person.tastes, added);
  const shown = [...tasteGroups.flatMap((group) => group.items.map((item) => item.key)), ...own];

  const toggle = (groupId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  function add(value: string) {
    const result = validateOwnTaste(value, person.tastes, shown);
    setError(result.error);
    if (result.key === null) return;
    setAdded((current) => [...current, result.key!]);
    setOpen((current) => new Set(current).add(ownGroup.id));
    setText("");
  }

  const rows = (keys: readonly string[], removable: boolean) => (
    <ul className="flex flex-col">
      {keys.map((key) => (
        <TasteRow
          key={key}
          label={tasteLabel(key)}
          value={person.tastes[key] ?? 0}
          onChange={(taste) => onChange(withTaste(person, key, taste))}
          onRemove={
            removable
              ? () => {
                  setAdded((current) => current.filter((entry) => entry !== key));
                  onChange(withTaste(person, key, 0));
                }
              : undefined
          }
        />
      ))}
    </ul>
  );

  const group = (groupId: string, title: string, keys: readonly string[], removable = false) => {
    const set = keys.filter((key) => (person.tastes[key] ?? 0) !== 0).length;
    const isOpen = open.has(groupId);
    return (
      <section key={groupId} data-testid={`taste-group-${groupId}`} className="border-t border-hairline first:border-t-0">
        <h4>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={`${id}-${groupId}`}
            onClick={() => toggle(groupId)}
            className="flex min-h-row w-full items-center gap-3 py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="min-w-0 flex-1 text-row-title text-ink">{title}</span>
            <span data-testid={`taste-group-${groupId}-summary`} className={cx("text-meta", set > 0 ? "font-semibold text-ink" : "text-ink-3")}>
              {set > 0 ? `${set} ${set === 1 ? "inställd" : "inställda"}` : "Okej"}
            </span>
            <ChevronRightIcon size={20} className={cx("shrink-0 text-ink-3 transition-transform motion-reduce:transition-none", isOpen && "rotate-90")} />
          </button>
        </h4>
        {isOpen ? <div id={`${id}-${groupId}`}>{rows(keys, removable)}</div> : null}
      </section>
    );
  };

  return (
    <section aria-labelledby={`${id}-taste`} data-testid="menu-taste" className="flex flex-col gap-3">
      <div>
        <h3 id={`${id}-taste`} className="text-section-label text-ink-2 uppercase">
          Smak
        </h3>
        <p className="text-meta text-ink-3">Rör bara det du har en åsikt om. Inget ifyllt betyder att personen äter allt.</p>
      </div>
      <p data-testid="taste-summary" className="text-body text-ink">
        {tasteSummary(person.name, person.tastes)}
      </p>
      <div className="flex flex-col rounded-lg bg-surface px-4">
        <div aria-hidden="true" className="flex justify-between border-b border-hairline py-2 text-meta text-ink-3">
          <span>Ogillar</span>
          <span>Okej</span>
          <span>Älskar</span>
        </div>
        {tasteGroups.map((entry) =>
          group(
            entry.id,
            entry.title,
            entry.items.map((item) => item.key),
          ),
        )}
        {own.length > 0 ? group(ownGroup.id, ownGroup.title, own, true) : null}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add(text);
        }}
      >
        <Input
          aria-label="Lägg till egen sak"
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          data-testid="menu-taste-input"
          value={text}
          // A little over the limit can be typed, so that "too long" is said instead of the text being cut silently.
          maxLength={maxTagLength + 20}
          enterKeyHint="done"
          placeholder="Lägg till egen sak"
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
    </section>
  );
}

function TasteRow({ label, value, onChange, onRemove }: { label: string; value: Taste; onChange: (taste: Taste) => void; onRemove?: () => void }) {
  const set = value !== 0;
  return (
    <li data-testid="taste-row" data-set={set} className="flex flex-col border-t border-hairline py-1 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className={cx("min-w-0 flex-1 text-row-title", set ? "text-ink" : "text-ink-2")}>{label}</span>
        <span className={cx("text-control", value < 0 ? "font-semibold text-sand-ink" : value > 0 ? "font-semibold text-mint-ink" : "text-ink-3")}>{tasteStepLabels[value]}</span>
        {onRemove ? (
          <button
            type="button"
            aria-label={`Ta bort ${label.toLocaleLowerCase("sv-SE")}`}
            onClick={onRemove}
            className="-mr-2 grid size-tap shrink-0 place-items-center rounded-full text-ink-3 outline-none focus-visible:outline-2 focus-visible:outline-accent"
          >
            ✕
          </button>
        ) : null}
      </div>
      <TasteSlider label={label} value={value} onChange={onChange} />
    </li>
  );
}
