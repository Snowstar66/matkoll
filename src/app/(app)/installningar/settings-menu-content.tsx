import { requireUserOrRedirect } from "@/features/auth/server";
import { SignOutButton } from "@/features/auth/ui/sign-out-button";
import { listPantrySitesWithCounts } from "@/features/pantry/server";
import {
  aiLevelLabels,
  aiProviderLabels,
  claudeModels,
  costRowTitle,
  formatMonthCost,
  type AiSettingsView,
  settingsPageHref,
} from "@/features/settings";
import { getAiMonthUsage, getAiSettingsView, listRecipeSites, listStores } from "@/features/settings/server";
import { SettingsMenu, type SettingsGroupData } from "@/features/settings/ui/settings-menu";
import { appName } from "@/app/app-info";

/** Reads one value for the start page; a failure shows the row without its value, and is logged by reason only. */
async function valueOf<T>(read: () => Promise<T>, reason: string): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error("settings_menu_value_unavailable", { value: reason, reason: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

/** "Claude Haiku 5.5 · Medel", "Qwen lokalt": the AI choice in force, short. */
export function aiValueText(view: AiSettingsView): string {
  const effective = view.effective;
  if (!effective) return view.defaultText;
  if (effective.provider === "lmstudio") return aiProviderLabels.lmstudio;
  const model = claudeModels.find((candidate) => candidate.id === effective.model)?.label ?? effective.model;
  return `Claude ${model.replace(/ \d.*$/, "")} · ${aiLevelLabels[effective.effort]}`;
}

/** "4 sajter", "1 sajt". */
export function sitesCountText(count: number): string {
  return `${count} ${count === 1 ? "sajt" : "sajter"}`;
}

/**
 * The start page of Inställningar (Story 14.7): the groups Konto, Hushåll,
 * Recept, AI (only for those it is shown to, as in Story 17.5) and Appen, with
 * short values, and "Logga ut" last.
 */
export async function SettingsMenuContent() {
  const user = await requireUserOrRedirect("/installningar");
  const [housing, stores, recipeSites, ai, aiUsage] = await Promise.all([
    valueOf(listPantrySitesWithCounts, "housing"),
    valueOf(listStores, "stores"),
    valueOf(listRecipeSites, "recipe_sites"),
    valueOf(getAiSettingsView, "ai"),
    valueOf(() => getAiMonthUsage(), "ai_usage"),
  ]);
  const selectedStore = stores?.find((store) => store.isSelected);

  const groups: SettingsGroupData[] = [
    { label: "Konto", rows: [{ href: settingsPageHref("konto"), icon: "👤", tile: "bg-mint", title: user.email }] },
    {
      label: "Hushåll",
      rows: [
        {
          href: settingsPageHref("boenden"),
          icon: "📍",
          tile: "bg-sand",
          title: "Boenden",
          value: housing?.map((site) => site.name).join(", "),
        },
        {
          href: settingsPageHref("butiker"),
          icon: "🏪",
          tile: "bg-tile-clay",
          title: "Butiker",
          value: selectedStore?.name,
        },
      ],
    },
    {
      label: "Recept",
      rows: [
        {
          href: settingsPageHref("receptsajter"),
          icon: "🌐",
          tile: "bg-sky",
          title: "Receptsajter",
          value: recipeSites ? sitesCountText(recipeSites.length) : undefined,
        },
        { href: settingsPageHref("spara-i-matkoll"), icon: "🔖", tile: "bg-tile-lilac", title: `Spara i ${appName}` },
      ],
    },
    ...(ai
      ? [
          {
            label: "AI",
            rows: [
              { href: settingsPageHref("ai"), icon: "✨", tile: "bg-mint", title: "Modell", value: aiValueText(ai) },
              // Story 17.6: the month's cost, a value without a page of its own.
              ...(aiUsage
                ? [
                    {
                      href: null,
                      icon: "💰",
                      tile: "bg-sand",
                      title: costRowTitle(aiUsage.monthName),
                      value: formatMonthCost(aiUsage.costSek),
                    } as const,
                  ]
                : []),
            ],
          } satisfies SettingsGroupData,
        ]
      : []),
    {
      label: "Appen",
      rows: [
        { href: settingsPageHref("installera"), icon: "📲", tile: "bg-sky", title: "Installera appen" },
        { href: settingsPageHref("siri"), icon: "🎙️", tile: "bg-tile-lilac", title: "Siri och genvägar" },
        { href: settingsPageHref("om"), icon: "ℹ️", tile: "bg-hairline", title: `Om ${appName}` },
      ],
    },
  ];

  return <SettingsMenu groups={groups} signOut={<SignOutButton asRow />} />;
}
