import { requireUserOrRedirect } from "@/features/auth/server";
import type { AiSettingsView } from "@/features/settings";
import { getAiSettingsView, SettingsDataError } from "@/features/settings/server";
import { AiSettings } from "@/features/settings/ui/ai-settings";

/**
 * The section AI in Inställningar (Story 17.5), read inside its own <Suspense>
 * (AD-18). Nothing is drawn for anyone it is not shown to, and nothing when
 * the choice cannot be read: the jobs then use the default, and the other
 * sections work as before.
 */
export async function AiContent() {
  await requireUserOrRedirect("/installningar");
  let view: AiSettingsView | null;
  try {
    view = await getAiSettingsView();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_ai_unavailable", { reason: error.detail });
    return null;
  }
  return view ? <AiSettings view={view} /> : null;
}
