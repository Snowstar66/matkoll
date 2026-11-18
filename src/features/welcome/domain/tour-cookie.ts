// The device remembers that the signed-in person has seen the welcome tour (Story 20.1), so the layout does not ask
// the database on every render: it renders again at every refresh of a live page (every 4 s on Inköpslista), and the
// answer never goes back to "not seen". The cookie holds the person's id, so another person on the same device who
// has not seen the tour still gets it. It is a convenience: without it (or with another id) the database decides.

export const tourSeenCookie = "livskoll-tour";

/** The cookie to set once the server has said the person has seen the tour: a year, for the whole app. */
export function tourSeenCookieText(userId: string, secure: boolean): string {
  return `${tourSeenCookie}=${encodeURIComponent(userId)}; path=/; max-age=31536000; samesite=lax${secure ? "; secure" : ""}`;
}
