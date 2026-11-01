import type { ComponentType } from "react";
import type { AiJobKind } from "@/lib/ai-job-shape";
import { BoxIcon, CarrotIcon, CartIcon, type IconProps, MealPlanIcon, RecipesIcon, SettingsIcon } from "../icons";

export type Destination = {
  href: string;
  label: string;
  /**
   * Where the tab bar may break a long label onto two lines when the tab is
   * narrow (a 375 px phone at 200 % zoom). Joined, the parts are `label`.
   */
  labelParts?: readonly string[];
  /** The destination's line icon (premium look): grey, and green with a soft fill when it is the current one. */
  Icon: ComponentType<IconProps>;
  /** The AI results that are shown on this surface, counted in its badge (Story 12.4). */
  aiKinds?: readonly AiJobKind[];
};

/** The five main surfaces, in tab order (EXPERIENCE.md, Information Architecture). */
export const mainDestinations: readonly Destination[] = [
  { href: "/recept", label: "Recept", Icon: RecipesIcon, aiKinds: ["suggest", "import"] },
  // At 200 % zoom even "Matsedel" is wider than its tab, so it breaks too.
  { href: "/matsedel", label: "Matsedel", labelParts: ["Mat", "sedel"], Icon: MealPlanIcon },
  // Story 10.4: "Inköpslista" (was "Lista") and "Matvaror" (was "Hemma",
  // the name of the first place too). The routes stay, so bookmarks work.
  { href: "/lista", label: "Inköpslista", labelParts: ["Inköps", "lista"], Icon: CartIcon },
  { href: "/hemma", label: "Matvaror", labelParts: ["Mat", "varor"], Icon: CarrotIcon, aiKinds: ["analyze"] },
  // Epic 18: the things of the home (tools, the storage room), kept apart from the food.
  { href: "/prylar", label: "Förråd", Icon: BoxIcon, aiKinds: ["things"] },
];

/** Settings: the gear in the Recept header on mobile, the bottom of the side menu on desktop. */
export const settingsDestination: Destination = { href: "/installningar", label: "Inställningar", Icon: SettingsIcon };

/** Paths whose scroll position is kept when switching between them. */
export const shellPaths: readonly string[] = [...mainDestinations, settingsDestination].map((d) => d.href);

/** `page` on the destination itself, `true` on a page below it, otherwise nothing. */
export function currentState(pathname: string | null, href: string): "page" | "true" | undefined {
  if (pathname === null) return undefined;
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}
