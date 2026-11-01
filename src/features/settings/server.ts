import "server-only";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { loadAiSettingIn } from "./data/ai-setting";
import { listApiKeysIn } from "./data/api-keys";
import { insertAiUsageIn, loadAiUsageIn } from "./data/ai-usage";
import { insertUserDefaults } from "./data/defaults";
import { loadActiveRecipeDomains, loadSelectedStore, loadStores } from "./data/queries";
import { aiSettingsVisible, type AiSetting, type AiSettingsView } from "./domain/ai-choice";
import { aiChoiceFor, aiSettingsViewFor } from "./data/ai-env";
import { stockholmMonth, usageCostSek, type AiMonthUsage } from "./domain/ai-usage";
import { compareDomains } from "./domain/domain-name";
import { compareStores, type Store } from "./domain/store";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. Writes go through the
// actions in ./actions (Inställningar, Stories 1.12 and 7.1).

/** What the functions below throw when Supabase fails; never user data. */
export { SettingsDataError } from "./data/client";

/**
 * The active approved recipe sites of the signed-in user (bare domain names,
 * AD-11), for the import flow. Read on every request, so a change in
 * Inställningar applies at once.
 */
export async function getActiveRecipeDomains(): Promise<string[]> {
  return loadActiveRecipeDomains(await createClient());
}

/**
 * The signed-in user's active recipe sites in alphabetical order, for the
 * list in Inställningar. Sorted here with `compareDomains`, the same order
 * the list keeps in the browser, not by the database's collation. For pages,
 * after requireUserOrRedirect, inside <Suspense> (AD-18). Throws
 * SettingsDataError.
 */
export async function listRecipeSites(): Promise<string[]> {
  return (await loadActiveRecipeDomains(await createClient())).sort(compareDomains);
}

/**
 * Every store of the signed-in user, the selected one first and the others
 * by name (`compareStores`), for the section Butik in Inställningar. For
 * pages, after requireUserOrRedirect, inside <Suspense> (AD-18). Throws
 * SettingsDataError.
 */
export async function listStores(): Promise<Store[]> {
  return (await loadStores(await createClient())).sort(compareStores);
}

/**
 * The store the signed-in user has selected, which the product choices
 * (Story 7.2) and the basket export (Story 7.3) use; `null` when none is
 * selected. Other modules pass it on as an argument and never assume there
 * is only one store. Throws SettingsDataError.
 */
export async function getSelectedStore(): Promise<Store | null> {
  return loadSelectedStore(await createClient());
}

/**
 * Start data for the signed-in user (AD-21): the start recipe sites, and the
 * default store when the user has none. Called by auth/confirm after a
 * successful sign-in; idempotent, so every sign-in may call it. Never turns
 * on a site Pontus has turned off, and never replaces a store.
 */
export async function ensureUserDefaults(): Promise<void> {
  await insertUserDefaults(await createClient());
}

/**
 * Story 17.5: the signed-in user (id and address) as the session says, for
 * the AI choice. Read from the session's claims here and not through the
 * auth module, which already imports this one.
 */
async function sessionUser(db: Awaited<ReturnType<typeof createClient>>): Promise<{ id: string; email: string } | null> {
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims) return null;
  const { sub, email } = data.claims;
  return typeof sub === "string" && typeof email === "string" ? { id: sub, email } : null;
}

/**
 * Story 17.5: what the section AI in Inställningar shows, or `null` when the
 * signed-in user is not to see it (outside development, an address that is
 * not in AI_SETTINGS_EMAILS). Carries only whether the keys are present,
 * never a key. Throws SettingsDataError.
 */
export async function getAiSettingsView(): Promise<AiSettingsView | null> {
  const db = await createClient();
  const user = await sessionUser(db);
  if (!user) return null;
  if (!aiSettingsVisible({ nodeEnv: env.NODE_ENV, email: user.email, allowed: env.AI_SETTINGS_EMAILS })) return null;
  return aiSettingsViewFor(env, await loadAiSettingIn(db));
}

/**
 * Story 17.5: the choice of AI for the signed-in user's next job, to pass to
 * `getAiServiceFor` in the AI port: the one saved in Inställningar, or the
 * default when there is none, when the section is not shown to the user, when
 * its key or URL is missing now, or when it cannot be read. The default is
 * Claude Haiku 5.5 at Medel when ANTHROPIC_API_KEY is set; without a key
 * (`null`) AI_PROVIDER/AI_MODEL decide. Read on every call, so a new choice applies without a restart. Never
 * throws for a settings problem: a job must not fail because the choice
 * could not be read.
 */
export async function getAiChoice(): Promise<AiSetting | null> {
  try {
    const db = await createClient();
    const user = await sessionUser(db);
    const visible =
      user !== null && aiSettingsVisible({ nodeEnv: env.NODE_ENV, email: user.email, allowed: env.AI_SETTINGS_EMAILS });
    return aiChoiceFor(env, visible ? await loadAiSettingIn(db) : null);
  } catch (error) {
    console.error("ai_setting_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return aiChoiceFor(env, null);
  }
}

/**
 * Story 17.6: this month's AI calls and cost for the signed-in user (the
 * calendar month in Stockholm), or `null` when the section AI is not shown
 * to them. Local models and the mock count as calls at 0 kr. Throws
 * SettingsDataError.
 */
export async function getAiMonthUsage(now: Date = new Date()): Promise<AiMonthUsage | null> {
  const db = await createClient();
  const user = await sessionUser(db);
  if (!user) return null;
  if (!aiSettingsVisible({ nodeEnv: env.NODE_ENV, email: user.email, allowed: env.AI_SETTINGS_EMAILS })) return null;
  const month = stockholmMonth(now);
  const models = await loadAiUsageIn(db, month.from, month.to);
  return {
    monthName: month.monthName,
    calls: models.reduce((sum, row) => sum + row.calls, 0),
    costSek: usageCostSek(models),
  };
}

/**
 * Story 17.6: the AI service for the signed-in user's next call, built from
 * their choice (getAiChoice), that saves each call's model and tokens in
 * ai_usage with the user's session. Every feature that asks the model uses
 * this one, so the month's total is complete. A usage row that cannot be
 * saved is logged and never fails the call. The AI port is loaded here, not
 * at the top: the sign-in and the save path of a photo import this module and
 * must not reach the port (a test for the photo route holds them to it).
 */
export async function getAiServiceForUser(): Promise<import("@/server/ai").AiService> {
  const { getAiServiceFor } = await import("@/server/ai");
  const choice = await getAiChoice();
  const db = await createClient();
  return getAiServiceFor(choice, (usage) => insertAiUsageIn(db, usage));
}

/** Story 17.9: the signed-in user's personal keys for Siri and shortcuts (never the keys themselves). Throws SettingsDataError. */
export async function listApiKeys(): Promise<import("./domain/api-key").ApiKeyView[]> {
  return listApiKeysIn(await createClient());
}
