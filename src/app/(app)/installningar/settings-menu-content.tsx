import { accountOf } from "@/features/auth";
import { getOwnerInbox } from "@/features/feedback/server";
import { initialOf, memberNamesText } from "@/features/household";
import { getHousehold, getMe } from "@/features/household/server";
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

/** "3 nya" on Inkorg; nothing when all is read. */
export function newCountText(unread: number): string | undefined {
  return unread > 0 ? `${unread} ${unread === 1 ? "ny" : "nya"}` : undefined;
}

/** "4 sajter", "1 sajt". */
export function sitesCountText(count: number): string {
  return `${count} ${count === 1 ? "sajt" : "sajter"}`;
}

/**
 * The start page of Inställningar (Story 14.7): the groups Konto, Appens ägare (only for the
 * app's owner, Story 20.3; named so in Story 21.2b), Hushåll (Medlemmar first, Story 21.2b), Recept, AI (only for those it is shown to, as in
 * Story 17.5) and Appen, with short values, and "Logga ut" last.
 */
export async function SettingsMenuContent() {
  const user = await requireUserOrRedirect("/installningar");
  const [housing, stores, recipeSites, ai, aiUsage, inbox, household, me] = await Promise.all([
    valueOf(listPantrySitesWithCounts, "housing"),
    valueOf(listStores, "stores"),
    valueOf(listRecipeSites, "recipe_sites"),
    valueOf(getAiSettingsView, "ai"),
    valueOf(() => getAiMonthUsage(), "ai_usage"),
    // Not there at all for anyone but the owner, not even hidden; a failure leaves it out too.
    valueOf(getOwnerInbox, "owner_inbox"),
    // Story 21.2b: who is in the household, and the person's own name.
    valueOf(getHousehold, "household"),
    getMe(),
  ]);
  const selectedStore = stores?.find((store) => store.isSelected);

  const groups: SettingsGroupData[] = [
    ...(inbox
      ? [
          {
            // Story 21.2b (decision 9): the app's owner, not to be mixed up with a household's.
            label: "Appens ägare",
            rows: [{ href: settingsPageHref("inkorg"), icon: "inbox", tile: "sky", title: "Inkorg", badge: newCountText(inbox.unread) }],
          } satisfies SettingsGroupData,
        ]
      : []),
    {
      label: "Hushåll",
      rows: [
        {
          href: settingsPageHref("medlemmar"),
          icon: "users",
          tile: "mint",
          title: "Medlemmar",
          value: household ? memberNamesText(household.members) : undefined,
        },
        {
          href: settingsPageHref("boenden"),
          icon: "pin",
          tile: "mint",
          title: "Boenden",
          value: housing?.map((site) => site.name).join(", "),
        },
        {
          href: settingsPageHref("butiker"),
          icon: "store",
          tile: "sky",
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
          icon: "globe",
          tile: "sky",
          title: "Receptsajter",
          value: recipeSites ? sitesCountText(recipeSites.length) : undefined,
        },
        { href: settingsPageHref("spara-i-matkoll"), icon: "bookmark", tile: "lilac", title: `Spara i ${appName}` },
      ],
    },
    ...(ai
      ? [
          {
            label: "AI",
            rows: [
              { href: settingsPageHref("ai"), icon: "sparkle", tile: "sand", title: "Modell", value: aiValueText(ai) },
              // Story 17.6: the month's cost, a value without a page of its own.
              ...(aiUsage
                ? [
                    {
                      href: null,
                      icon: "coin",
                      tile: "sand",
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
        { href: settingsPageHref("installera"), icon: "install", tile: "sky", title: "Installera appen" },
        { href: settingsPageHref("appikon"), icon: "badge", tile: "mint", title: "Siffra på appikonen" },
        { href: settingsPageHref("siri"), icon: "mic", tile: "lilac", title: "Siri och genvägar" },
        { href: settingsPageHref("om"), icon: "info", tile: "plain", title: `Om ${appName}` },
      ],
    },
  ];

  const fallback = accountOf(user.email);
  const account = me
    ? { href: settingsPageHref("konto"), name: me.name, email: user.email, initial: initialOf(me.name), tone: me.color }
    : { href: settingsPageHref("konto"), name: fallback.name, email: user.email, initial: fallback.initial };
  return <SettingsMenu account={account} groups={groups} signOut={<SignOutButton asRow />} />;
}
