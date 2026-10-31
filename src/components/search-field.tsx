"use client";

import { type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { cx } from "./cx";
import { CloseIcon, SearchIcon } from "./icons";

/** Pause after the last keystroke before searching (EXPERIENCE.md, Sökfält). */
export const searchDelayMs = 200;

/** What a parent can do with the field, e.g. "Rensa sökning" in an empty state. */
export type SearchFieldHandle = {
  /** Empties the field, searches for "" at once and puts focus in the field. */
  clear: () => void;
};

export type SearchFieldProps = {
  /** Name for screen readers, e.g. "Sök recept". */
  label: string;
  placeholder?: string;
  defaultValue?: string;
  /** Called 200 ms (`delayMs`) after typing stops, and at once on Enter or when the field becomes empty. */
  onSearch: (query: string) => void;
  /**
   * The pause after the last keystroke, `searchDelayMs` by default; 0 calls
   * `onSearch` on every change, for a list that is already on the page
   * (Förråd, Story 11.3).
   */
  delayMs?: number;
  /** Whether the cross "Rensa sökning" shows while the field has text; false when the page offers its own (Förråd without a match). */
  clearable?: boolean;
  /** The most characters the field takes, e.g. the action's limit. */
  maxLength?: number;
  className?: string;
  ref?: Ref<SearchFieldHandle>;
};

export function SearchField({
  label,
  placeholder,
  defaultValue = "",
  onSearch,
  maxLength,
  delayMs = searchDelayMs,
  clearable = true,
  className,
  ref,
}: SearchFieldProps) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The latest callback, so a new function from the parent does not restart the wait.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function searchNow(query: string) {
    clearTimeout(timer.current);
    onSearchRef.current(query);
  }

  function change(next: string) {
    setValue(next);
    if (next === "" || delayMs <= 0) {
      searchNow(next);
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearchRef.current(next), delayMs);
  }

  function clear() {
    setValue("");
    searchNow("");
    inputRef.current?.focus();
  }

  useImperativeHandle(ref, () => ({ clear }));

  return (
    <div
      className={cx(
        "flex h-tap items-center gap-2 rounded-md bg-surface pl-3 text-ink-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        className,
      )}
    >
      <SearchIcon size={18} className="shrink-0" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            searchNow(value);
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && clearable ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Rensa sökning"
          className="flex size-tap shrink-0 items-center justify-center rounded-md text-ink-3"
        >
          <CloseIcon size={18} />
        </button>
      ) : null}
    </div>
  );
}
