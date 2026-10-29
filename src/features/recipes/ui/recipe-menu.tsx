"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { MoreIcon } from "@/components/icons";
import { TrashButton } from "@/components/trash-button";
import type { SavedRecipe } from "../domain/saved-recipe";
import { EditRecipeSheet } from "./edit-recipe-sheet";
import { useRecipeDelete } from "./recipe-delete";
import type { SearchIngredients } from "@/components/ingredient-picker";

/**
 * The recipe view's menu (⋯) with "Ändra", which opens Ändra recept
 * (EXPERIENCE.md, IA). The menu closes with Esc, a tap outside or a choice;
 * focus starts on its first item and goes back to ⋯. `searchIngredients`
 * comes from the page, which may import the catalog's server entry (AD-1).
 */
export function RecipeMenu({
  recipe,
  searchIngredients,
  onMenu = false,
  className,
}: {
  recipe: SavedRecipe;
  searchIngredients: SearchIngredients;
  /** The recipe is on the current meal plan, which the question says (Story 13.2). */
  onMenu?: boolean;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  /** A fresh form each time the sheet opens, from the recipe as last saved. */
  const [editKey, setEditKey] = useState(0);
  const router = useRouter();
  const { ask, dialog } = useRecipeDelete(() => {
    // Replace, so "back" never leads to the gone recipe.
    router.replace("/recept");
  });
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    firstItem.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    toggle.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") {
      // Focus moves on as Tab says; the menu just closes.
      setMenuOpen(false);
    }
  }

  function edit() {
    // Focus on ⋯ first, so the sheet gives it back when it closes.
    closeMenu();
    setEditKey((key) => key + 1);
    setEditing(true);
  }

  return (
    <div ref={root} className={className ? `relative flex ${className}` : "relative flex"}>
      <TrashButton
        label="Ta bort recept"
        className="rounded-full"
        onPress={() => ask({ id: recipe.id, title: recipe.title, onMenu })}
      />
      {dialog}
      <button
        ref={toggle}
        type="button"
        aria-label="Fler val"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        className="flex size-tap items-center justify-center rounded-full text-ink-2"
      >
        <MoreIcon size={24} />
      </button>
      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Fler val"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-30 flex min-w-40 flex-col rounded-md border border-hairline bg-surface py-1"
        >
          <button
            ref={firstItem}
            type="button"
            role="menuitem"
            onClick={edit}
            className="min-h-tap px-4 text-left text-body text-ink"
          >
            Ändra
          </button>
        </div>
      ) : null}
      <EditRecipeSheet
        session={editKey}
        open={editing}
        onClose={() => setEditing(false)}
        recipe={recipe}
        searchIngredients={searchIngredients}
      />
    </div>
  );
}
