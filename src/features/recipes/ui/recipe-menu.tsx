"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { MoreIcon, ShareIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { setRecipeShared } from "../actions/share-recipe";
import { addToStarterPack, removeFromStarterPack } from "../actions/starter-recipes";
import type { SavedRecipe } from "../domain/saved-recipe";
import { EditRecipeSheet } from "./edit-recipe-sheet";
import { useRecipeDelete } from "./recipe-delete";
import { ShareNameSheet } from "./share-name-sheet";
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
  nameIsDefault = false,
  starterPack,
  className,
}: {
  recipe: SavedRecipe;
  searchIngredients: SearchIngredients;
  /** The recipe is on the current meal plan, which the question says (Story 13.2). */
  onMenu?: boolean;
  /** The household still has the name it got with the account: the first share asks for a name. */
  nameIsDefault?: boolean;
  /**
   * Startrecept, for the app's owner only (undefined for anyone else): whether the recipe is in the pack
   * (its item), for "Lägg i startpaketet" / "Ta bort ur startpaketet".
   */
  starterPack?: { itemId: string | null };
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [askingName, setAskingName] = useState(false);
  /** A fresh form each time the sheet opens, from the recipe as last saved. */
  const [editKey, setEditKey] = useState(0);
  const router = useRouter();
  const { showToast } = useToast();
  const { ask, dialog } = useRecipeDelete(() => {
    // Replace, so "back" never leads to the gone recipe.
    router.replace("/recept");
  });
  const menuId = useId();
  const shareStatusId = useId();
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

  // Delade recept: "Dela med andra" / "Sluta dela", at once and without a question (it is undone the same way).
  // Not on a copy saved from another household (it is theirs to share; the database refuses it too).
  // Tillval "Visa delade recept" only hides others' recipes, so it does not hide this.
  const isShared = recipe.isShared ?? false;
  const withShare = !recipe.sharedFromName || isShared;
  // The first share of a household with its default name asks what others should see it as.
  async function toggleShare() {
    closeMenu();
    if (!isShared && nameIsDefault) {
      setAskingName(true);
      return;
    }
    let result: Result<unknown>;
    try {
      result = await setRecipeShared({ id: recipe.id, shared: !isShared });
    } catch {
      result = fail("recipe_share_failed");
    }
    if (result.ok || result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  /** The answer to the name sheet: shares, renaming first when a name was given. The message when it fails. */
  async function shareNamed(name: string | null): Promise<string | null> {
    let result: Result<unknown>;
    try {
      result = await setRecipeShared({ id: recipe.id, shared: true }, name ?? undefined);
    } catch {
      result = fail("recipe_share_failed");
    }
    if (result.ok || result.error.code === "unauthorized") {
      router.refresh();
      return null;
    }
    return result.error.fields?.name ?? result.error.message;
  }

  // Startrecept: the owner puts an own recipe in the pack, or takes it out; never on a copy saved from another household.
  const withStarter = starterPack !== undefined && !recipe.sharedFromName;
  async function toggleStarter() {
    closeMenu();
    if (!starterPack) return;
    let result: Result<unknown>;
    try {
      result = starterPack.itemId ? await removeFromStarterPack(starterPack.itemId) : await addToStarterPack(recipe.id);
    } catch {
      result = fail("starter_pack_failed");
    }
    if (result.ok) {
      showToast(starterPack.itemId ? "Togs bort ur startpaketet." : "Ligger nu i startpaketet.");
      router.refresh();
    } else {
      showToast(result.error.message, { role: "alert" });
    }
  }

  function remove() {
    // Focus on ⋯ first, so the confirmation gives it back when it closes.
    closeMenu();
    ask({ id: recipe.id, title: recipe.title, onMenu });
  }

  return (
    <div ref={root} className={className ? `relative flex ${className}` : "relative flex"}>
      {dialog}
      <ShareNameSheet open={askingName} onClose={() => setAskingName(false)} onSubmit={shareNamed} />
      <button
        ref={toggle}
        type="button"
        aria-label="Fler val"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        className="flex size-tap items-center justify-center rounded-full text-ink"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-glass backdrop-blur-md">
          <MoreIcon size={22} />
        </span>
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
          {withShare ? (
            <button
              type="button"
              role="menuitem"
              onClick={toggleShare}
              aria-describedby={isShared ? shareStatusId : undefined}
              className="flex min-h-tap items-center justify-between gap-4 px-4 text-left text-body whitespace-nowrap text-ink"
            >
              {/* UX-01: the "Delat" pill left the top of the page; the menu says the status instead. */}
              <span className="flex flex-col py-1.5">
                <span>{isShared ? "Sluta dela" : "Dela med andra"}</span>
                {isShared ? (
                  <span id={shareStatusId} aria-hidden="true" className="text-meta text-ink-2" data-testid="recipe-share-status">
                    Delat med andra
                  </span>
                ) : null}
              </span>
              <ShareIcon size={20} className="shrink-0 text-ink-2" />
            </button>
          ) : null}
          {withStarter ? (
            <button
              type="button"
              role="menuitem"
              onClick={toggleStarter}
              className="min-h-tap px-4 text-left text-body whitespace-nowrap text-ink"
            >
              {starterPack?.itemId ? "Ta bort ur startpaketet" : "Lägg i startpaketet"}
            </button>
          ) : null}
          {/* Story 19.4: Ta bort is last in the menu, in muted red, not a bin next to the heart. */}
          <button
            type="button"
            role="menuitem"
            onClick={remove}
            className="min-h-tap px-4 text-left text-body text-danger"
          >
            Ta bort
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
