"use client";

import { useEffect } from "react";
import { rememberedWeekCookie, weekParam } from "../domain/week";

/**
 * Remembers the week being viewed on Matsedel or Inköpslista (UX-04): a cookie
 * on this device, so the other page, the recipe page and "Rätter med
 * erbjudanden" open on the same week. The server reads it when the address has
 * no `?vecka=`. Renders nothing.
 */
export function RememberWeek({ weekStart }: { weekStart: string }) {
  useEffect(() => {
    try {
      document.cookie = `${rememberedWeekCookie}=${weekParam(weekStart)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the pages fall back to this week.
    }
  }, [weekStart]);
  return null;
}
