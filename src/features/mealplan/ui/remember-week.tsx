"use client";

import { useEffect } from "react";
import { isPastWeek, rememberedWeekCookie, weekParam } from "../domain/week";

/**
 * Remembers the week being viewed on Matsedel or Inköpslista (UX-04): a cookie
 * on this device, so the other page, the recipe page and "Rätter med
 * erbjudanden" open on the same week. The server reads it when the address has
 * no `?vecka=`. A week that has passed (Förra veckan on Matsedel) is only looked at and never saved. Renders nothing.
 */
export function RememberWeek({ weekStart }: { weekStart: string }) {
  useEffect(() => {
    if (isPastWeek(weekStart)) return;
    try {
      document.cookie = `${rememberedWeekCookie}=${weekParam(weekStart)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the pages fall back to this week.
    }
  }, [weekStart]);
  return null;
}
