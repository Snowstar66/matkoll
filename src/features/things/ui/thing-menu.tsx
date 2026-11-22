"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreIcon, TagIcon, TrashIcon } from "@/components/icons";
import { categoryLabelText, removeThingText } from "../domain/thing-edit";

// The ⋯ in a föremål's sheet (Förråd flow sketches, C3; Pontus 22 Nov): Kategori and Ta bort föremålet are not the last
// two lines of a long sheet any more but two rows in a small menu at the top, next to "Avbryt". "Byt kategori" goes to the
// category step as before, and "Ta bort föremålet" (red) removes at once, with Ångra, as before.

export const changeCategoryText = `Byt ${categoryLabelText.toLowerCase()}`;
export const thingMenuLabel = "Fler val";

export function ThingMenu({ onCategory, onRemove, disabled = false }: { onCategory: () => void; onRemove: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    // A tap outside closes it; the first row takes focus so the keyboard is in the menu.
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={thingMenuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex size-tap items-center justify-center rounded-full text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 ${open ? "bg-fill" : ""}`}
        data-testid="thing-menu"
      >
        <MoreIcon size={22} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={thingMenuLabel}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Closes the menu, not the sheet under it.
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }
          }}
          className="absolute top-full right-0 z-20 w-59 overflow-hidden rounded-[14px] bg-surface-2 shadow-float"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close(false);
              onCategory();
            }}
            className="flex min-h-13 w-full items-center gap-3.5 px-4 text-left text-body text-ink focus-visible:bg-fill focus-visible:outline-none"
            data-testid="thing-category"
          >
            <TagIcon size={22} className="shrink-0 text-ink-2" />
            {changeCategoryText}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close(false);
              onRemove();
            }}
            className="flex min-h-13 w-full items-center gap-3.5 border-t border-hairline px-4 text-left text-body text-danger focus-visible:bg-fill focus-visible:outline-none"
            data-testid="thing-remove"
          >
            <TrashIcon size={22} className="shrink-0" />
            {removeThingText}
          </button>
        </div>
      ) : null}
    </div>
  );
}
