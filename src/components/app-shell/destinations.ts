import type { ComponentType } from "react";
import type { AiJobKind } from "@/lib/ai-job-shape";
import { BoxIcon, CarrotIcon, CartIcon, HelpIcon, type IconProps, MealPlanIcon, RecipesIcon, SettingsIcon } from "../icons";
import { BoxFilledIcon, CarrotFilledIcon, CartFilledIcon, MealPlanFilledIcon, RecipesFilledIcon } from "../icons-filled";

export type Destination = {
  href: string;
  label: string;
  /**
   * Where the tab bar may break a long label onto two lines when the tab is
   * narrow (a 375 px phone at 200 % zoom). Joined, the parts are `label`.
   */
  labelParts?: readonly string[];
  /** The destination's line icon: grey when it is not the current one. */
  Icon: ComponentType<IconProps>;
  /**
   * The filled twin of `Icon` (ikoner.html, variant B), shown in accent when
   * this is the current destination. Without one, the current item shows
   * `Icon` with a soft fill (Inställningar, Hjälp och tips).
   */
  FilledIcon?: ComponentType<IconProps>;
  /** The AI results that are shown on this surface, counted in its badge (Story 12.4). */
  aiKinds?: readonly AiJobKind[];
  /** What the badge counts, for a screen reader, one and many: Förråd's are read cards ("1 nytt kort"). Without it "AI-resultat". */
  badgeUnit?: readonly [one: string, many: string];
  /** The anchor of this surface's section in Hjälp och tips (Story 19.2): `/hjalp#recept`. */
  helpId?: string;
};

/** The five main surfaces, in tab order (EXPERIENCE.md, Information Architecture). */
export const mainDestinations: readonly Destination[] = [
  { href: "/recept", helpId: "recept", label: "Recept", Icon: RecipesIcon, FilledIcon: RecipesFilledIcon, aiKinds: ["suggest", "import"] },
  // At 200 % zoom even "Matsedel" is wider than its tab, so it breaks too.
  { href: "/matsedel", helpId: "matsedel", label: "Matsedel", labelParts: ["Mat", "sedel"], Icon: MealPlanIcon, FilledIcon: MealPlanFilledIcon },
  // Story 10.4: "Inköpslista" (was "Lista") and "Matvaror" (was "Hemma",
  // the name of the first place too). The routes stay, so bookmarks work.
  { href: "/lista", helpId: "inkopslista", label: "Inköpslista", labelParts: ["Inköps", "lista"], Icon: CartIcon, FilledIcon: CartFilledIcon },
  { href: "/hemma", helpId: "matvaror", label: "Matvaror", labelParts: ["Mat", "varor"], Icon: CarrotIcon, FilledIcon: CarrotFilledIcon, aiKinds: ["analyze"] },
  // Epic 18: the things of the home (tools, the storage room), kept apart from the food.
  { href: "/prylar", helpId: "forrad", label: "Förråd", Icon: BoxIcon, FilledIcon: BoxFilledIcon, aiKinds: ["things"], badgeUnit: ["nytt kort", "nya kort"] },
];

/** Settings: reached from the P button on a phone (Story 19.2), the bottom of the side menu on desktop. */
export const settingsDestination: Destination = { href: "/installningar", label: "Inställningar", Icon: SettingsIcon };

/** Hjälp och tips (Story 19.2): not a tab, so none is marked while it shows. */
export const helpDestination: Destination = { href: "/hjalp", label: "Hjälp och tips", Icon: HelpIcon };

/** The address of Hjälp och tips on the section for the tab `pathname` is on, or the top of the page. */
export function helpHref(pathname: string | null): string {
  const tab = mainDestinations.find((destination) => currentState(pathname, destination.href) !== undefined);
  return tab?.helpId ? `${helpDestination.href}#${tab.helpId}` : helpDestination.href;
}

/** Paths whose scroll position is kept when switching between them. */
export const shellPaths: readonly string[] = [...mainDestinations, settingsDestination].map((d) => d.href);

/** `page` on the destination itself, `true` on a page below it, otherwise nothing. */
export function currentState(pathname: string | null, href: string): "page" | "true" | undefined {
  if (pathname === null) return undefined;
  if (pathname === href) return "page";
  if (pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}
