import type { ComponentType } from "react";
import { HomeIcon, type IconProps, ListIcon, MealPlanIcon, RecipesIcon, SettingsIcon } from "../icons";

export type Destination = {
  href: string;
  label: string;
  /**
   * Where the tab bar may break a long label onto two lines when the tab is
   * narrow (a 375 px phone at 200 % zoom). Joined, the parts are `label`.
   */
  labelParts?: readonly string[];
  Icon: ComponentType<IconProps>;
};

/** The four main surfaces, in tab order (EXPERIENCE.md, Information Architecture). */
export const mainDestinations: readonly Destination[] = [
  { href: "/recept", label: "Recept", Icon: RecipesIcon },
  // At 200 % zoom even "Matsedel" is wider than its tab, so it breaks too.
  { href: "/matsedel", label: "Matsedel", labelParts: ["Mat", "sedel"], Icon: MealPlanIcon },
  // Story 10.4: "Inköpslista" (was "Lista") and "Lagersaldo" (was "Hemma",
  // the name of the first place too). The routes stay, so bookmarks work.
  { href: "/lista", label: "Inköpslista", labelParts: ["Inköps", "lista"], Icon: ListIcon },
  { href: "/hemma", label: "Lagersaldo", labelParts: ["Lager", "saldo"], Icon: HomeIcon },
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
