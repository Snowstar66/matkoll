import type { AiJobKind } from "@/lib/ai-job-shape";

export type Destination = {
  href: string;
  label: string;
  /**
   * Where the tab bar may break a long label onto two lines when the tab is
   * narrow (a 375 px phone at 200 % zoom). Joined, the parts are `label`.
   */
  labelParts?: readonly string[];
  /** The sketch's coloured emoji (Story 14.4); grey and dimmed when the destination is not the current one. */
  emoji: string;
  /** The AI results that are shown on this surface, counted in its badge (Story 12.4). */
  aiKinds?: readonly AiJobKind[];
};

/** The five main surfaces, in tab order (EXPERIENCE.md, Information Architecture). */
export const mainDestinations: readonly Destination[] = [
  { href: "/recept", label: "Recept", emoji: "\u{1F4D6}", aiKinds: ["suggest", "import"] },
  // At 200 % zoom even "Matsedel" is wider than its tab, so it breaks too.
  { href: "/matsedel", label: "Matsedel", labelParts: ["Mat", "sedel"], emoji: "\u{1F4C5}" },
  // Story 10.4: "Inköpslista" (was "Lista") and "Matvaror" (was "Hemma",
  // the name of the first place too). The routes stay, so bookmarks work.
  // Story 11.1: Story 14.4: the sketch's emoji replace the line icons.
  { href: "/lista", label: "Inköpslista", labelParts: ["Inköps", "lista"], emoji: "\u{1F6D2}" },
  { href: "/hemma", label: "Matvaror", labelParts: ["Mat", "varor"], emoji: "\u{1F955}", aiKinds: ["analyze"] },
  // Epic 18: the things of the home (tools, the storage room), kept apart from the food.
  { href: "/prylar", label: "Förråd", emoji: "\u{1F9F0}", aiKinds: ["things"] },
];

/** Settings: the gear in the Recept header on mobile, the bottom of the side menu on desktop. */
export const settingsDestination: Destination = { href: "/installningar", label: "Inställningar", emoji: "\u2699\uFE0F" };

/** Paths whose scroll position is kept when switching between them. */
export const shellPaths: readonly string[] = [...mainDestinations, settingsDestination].map((d) => d.href);

/** `page` on the destination itself, `true` on a page below it, otherwise nothing. */
export function currentState(pathname: string | null, href: string): "page" | "true" | undefined {
  if (pathname === null) return undefined;
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}
