import type { ComponentType } from "react";
import { HomeIcon, type IconProps, ListIcon, MealPlanIcon, RecipesIcon, SettingsIcon } from "../icons";

export type Destination = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
};

/** The four main surfaces, in tab order (EXPERIENCE.md, Information Architecture). */
export const mainDestinations: readonly Destination[] = [
  { href: "/recept", label: "Recept", Icon: RecipesIcon },
  { href: "/matsedel", label: "Matsedel", Icon: MealPlanIcon },
  { href: "/lista", label: "Lista", Icon: ListIcon },
  { href: "/hemma", label: "Hemma", Icon: HomeIcon },
];

/** Settings: the gear in the Recept header on mobile, the bottom of the side menu on desktop. */
export const settingsDestination: Destination = { href: "/installningar", label: "Inställningar", Icon: SettingsIcon };

/** Paths whose scroll position is kept when switching between them. */
export const shellPaths: readonly string[] = [...mainDestinations, settingsDestination].map((d) => d.href);

/** `page` on the destination itself, `true` on a page below it, otherwise nothing. */
export function currentState(pathname: string, href: string): "page" | "true" | undefined {
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}
