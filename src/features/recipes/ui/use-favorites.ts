"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useTransition } from "react";
import { useToast } from "@/components/toast";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { setFavorite as saveFavorite } from "../actions/set-favorite";
import type { FavoriteChange } from "../domain/recipe-list";

/**
 * The hearts of a list or a recipe view (FR-9). `current` is whether each
 * recipe is a favourite as the server last said. A tap shows the new value at
 * once (useOptimistic) and saves it with the setFavorite action; the server's
 * next render, which the action asks for, then brings the saved value. When
 * the latest tap on a heart cannot be saved, the heart goes back and a short
 * confirmation says so; an earlier tap that failed says nothing when a later
 * one was saved. An expired session refreshes the page, which sends Pontus
 * to sign in.
 */
export function useFavorites(current: Readonly<Record<string, boolean>>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [favorites, showFavorite] = useOptimistic(current, (state, change: FavoriteChange) => ({
    ...state,
    [change.id]: change.isFavorite,
  }));
  const [, startTransition] = useTransition();
  /** The number of the latest tap per recipe. */
  const latest = useRef(new Map<string, number>());

  function setFavorite(id: string, isFavorite: boolean) {
    const request = (latest.current.get(id) ?? 0) + 1;
    latest.current.set(id, request);
    startTransition(async () => {
      showFavorite({ id, isFavorite });
      let result: Result<FavoriteChange>;
      try {
        result = await saveFavorite({ id, isFavorite });
      } catch {
        // No connection, or the server failed: the same as a refused save.
        result = fail("recipe_favorite_failed");
      }
      if (result.ok || latest.current.get(id) !== request) return;
      if (result.error.code === "unauthorized") router.refresh();
      else showToast(errorMessages.recipe_favorite_failed);
    });
  }

  return { favorites, setFavorite };
}
