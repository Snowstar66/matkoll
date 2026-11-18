/**
 * What counts as a quick dish, the same everywhere: the category Snabbt in Recept, the chip Snabbt in Matsedel's
 * "Lägg till nya rätter" and Veckoagentens "Snabbt på vardagar". A dish with no time (or 0) is not quick.
 */
export const quickMaxMinutes = 30;

export const isQuickDish = (totalMinutes: number | null | undefined): boolean => Boolean(totalMinutes && totalMinutes <= quickMaxMinutes);
