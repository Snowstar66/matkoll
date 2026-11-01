"use client";

import { useMemo } from "react";
import { HeartToggle } from "@/components/heart-toggle";
import { useFavorites } from "./use-favorites";

/** The heart in the recipe view: the same action and behaviour as in the library. */
export function FavoriteButton({ id, isFavorite, glass = false, className }: { id: string; isFavorite: boolean; glass?: boolean | "large"; className?: string }) {
  const current = useMemo(() => ({ [id]: isFavorite }), [id, isFavorite]);
  const { favorites, setFavorite } = useFavorites(current);
  return (
    <HeartToggle
      pressed={favorites[id] ?? isFavorite}
      onPressedChange={(pressed) => setFavorite(id, pressed)}
      glass={glass}
      className={className}
    />
  );
}
