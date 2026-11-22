import { accountOf } from "@/features/auth";
import { getOwnerInbox } from "@/features/feedback/server";
import { initialOf, memberNamesText } from "@/features/household";
import { getHousehold, getMe } from "@/features/household/server";
import { requireUserOrRedirect } from "@/features/auth/server";
import { SignOutButton } from "@/features/auth/ui/sign-out-button";
import { staplesCountText } from "@/features/pantry";
import { listPantrySitesWithCounts, listStaples } from "@/features/pantry/server";
import { aiLevelLabels, aiProviderLabels, claudeModels, type AiSettingsView, settingsPageHref } from "@/features/settings";
import { listStores } from "@/features/settings/server";
import { SettingsMenu, type SettingsGroupData } from "@/features/settings/ui/settings-menu";
import { appName } from "@/app/app-info";
import { readBuildInfo, versionLine } from "@/app/build-info";
import { latestReleaseDate } from "./nyheter/releases";

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
 * app's owner, Story 20.3; named so in Story 21.2b), Hushållet (Medlemmar first), Den här telefonen,
 * Funktioner (Tillval) and Om appen (ending in Avancerat, which holds Receptsajter and the AI rows), with
 * short values, and "Logga ut" last.
 */
export async function SettingsMenuContent() {
  const user = await requireUserOrRedirect("/installningar");
  const [housing, stores, inbox, household, me, staples] = await Promise.all([
    valueOf(listPantrySitesWithCounts, "housing"),
    valueOf(listStores, "stores"),
    // Not there at all for anyone but the owner, not even hidden; a failure leaves it out too.
    valueOf(getOwnerInbox, "owner_inbox"),
    // Story 21.2b: who is in the household, and the person's own name.
    valueOf(getHousehold, "household"),
    getMe(),
    valueOf(listStaples, "staples"),
  ]);
  const selectedStore = stores?.find((store) => store.isSelected);

  const groups: SettingsGroupData[] = [
    ...(inbox
      ? [
          {
            // Story 21.2b (decision 9): the app's owner, not to be mixed up with a household's.
            label: "Appens ägare",
            rows: [
              { href: settingsPageHref("inkorg"), icon: "inbox", tile: "sky", title: "Inkorg", badge: newCountText(inbox.unread) },
              // Story 21.1: invite an address without touching Vercel; shown with the inbox, to the owner only.
              { href: settingsPageHref("inbjudningar"), icon: "users", tile: "mint", title: "Inbjudningar" },
              // Tak för AI-kostnad: the daily cap per household and what each has cost; to the owner only.
              { href: settingsPageHref("ai-kostnad"), icon: "coin", tile: "sand", title: "AI-kostnad" },
              // The pack of the owner's own recipes that households may choose from; to the owner only. Named so it is not mixed up with the Tillval Startrecept.
              { href: settingsPageHref("startrecept"), icon: "sparkle", tile: "mint", title: "Startrecept-paket" },
            ],
          } satisfies SettingsGroupData,
        ]
      : []),
    {
      label: "Hushållet",
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
        {
          // Basvaror (Pontus 2026-11-02): what the household always has, never on the list.
          href: settingsPageHref("basvaror"),
          icon: "pantry",
          tile: "sand",
          title: "Basvaror",
          value: staples ? staplesCountText(staples.length) : undefined,
        },
      ],
    },
    {
      label: "Den här telefonen",
      rows: [
        { href: settingsPageHref("utseende"), icon: "palette", tile: "mint", title: "Utseende", deviceValue: "palette" },
        { href: settingsPageHref("notiser"), icon: "bell", tile: "sky", title: "Notiser", deviceValue: "push" },
        { href: settingsPageHref("appikon"), icon: "badge", tile: "mint", title: "Siffra på appikonen", deviceValue: "badge" },
        { href: settingsPageHref("installera"), icon: "install", tile: "sky", title: "Installera appen" },
        { href: settingsPageHref("telefon"), icon: "mic", tile: "lilac", title: "Använd med telefonen" },
      ],
    },
    {
      label: "Funktioner",
      rows: [{ href: settingsPageHref("tillval"), icon: "sliders", tile: "mint", title: "Tillval" }],
    },
    {
      label: "Om appen",
      rows: [
        { href: settingsPageHref("nyheter"), icon: "sparkle", tile: "mint", title: "Nyheter", newsSince: latestReleaseDate },
        { href: settingsPageHref("om"), icon: "info", tile: "plain", title: `Om ${appName}`, value: versionLine(readBuildInfo()) },
        { href: settingsPageHref("avancerat"), icon: "gear", tile: "plain", title: "Avancerat" },
      ],
    },
  ];

  const fallback = accountOf(user.email);
  const account = me
    ? { href: settingsPageHref("konto"), name: me.name, email: user.email, initial: initialOf(me.name), tone: me.color }
    : { href: settingsPageHref("konto"), name: fallback.name, email: user.email, initial: fallback.initial };
  return <SettingsMenu account={account} groups={groups} signOut={<SignOutButton asRow />} />;
}
