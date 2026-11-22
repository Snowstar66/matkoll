import { requireUserOrRedirect } from "@/features/auth/server";
import { costRowTitle, formatMonthCost, settingsPageHref } from "@/features/settings";
import { getAiMonthUsage, getAiSettingsView, listRecipeSites } from "@/features/settings/server";
import { AdvancedSettings } from "@/features/settings/ui/advanced-settings";
import type { SettingsGroupData } from "@/features/settings/ui/settings-menu";
import { aiValueText, sitesCountText } from "./settings-menu-content";

/** Reads one value; a failure shows the row without its value, and is logged by reason only. */
async function valueOf<T>(read: () => Promise<T>, reason: string): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error("settings_advanced_value_unavailable", { value: reason, reason: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

/**
 * The page Avancerat, read inside its own <Suspense>: the group with Receptsajter for everyone, and the AI
 * group (as on the start page before, Story 17.5) and Felsökning only for those the AI row is shown to.
 */
export async function AdvancedContent() {
  await requireUserOrRedirect("/installningar/avancerat");
  const [sites, ai, usage] = await Promise.all([
    valueOf(listRecipeSites, "recipe_sites"),
    valueOf(getAiSettingsView, "ai"),
    valueOf(() => getAiMonthUsage(), "ai_usage"),
  ]);
  const sitesGroup: SettingsGroupData = {
    label: "Hushållet",
    rows: [
      {
        href: settingsPageHref("receptsajter"),
        icon: "globe",
        tile: "sky",
        title: "Receptsajter",
        value: sites ? sitesCountText(sites.length) : undefined,
      },
    ],
  };
  const aiGroup: SettingsGroupData | null = ai
    ? {
        label: "AI",
        rows: [
          { href: settingsPageHref("ai"), icon: "sparkle", tile: "sand", title: "Modell", value: aiValueText(ai) },
          // Story 17.6: the month's cost, a value without a page of its own.
          ...(usage ? [{ href: null, icon: "coin", tile: "sand", title: costRowTitle(usage.monthName), value: formatMonthCost(usage.costSek) } as const] : []),
        ],
      }
    : null;
  return <AdvancedSettings sites={sitesGroup} ai={aiGroup} />;
}
