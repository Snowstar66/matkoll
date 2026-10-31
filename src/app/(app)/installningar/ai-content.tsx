import { redirect } from "next/navigation";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { AiSettingsView } from "@/features/settings";
import { getAiSettingsView, SettingsDataError } from "@/features/settings/server";
import { Notice } from "@/components/notice";
import { errorMessages } from "@/lib/errors";
import { AiSettings } from "@/features/settings/ui/ai-settings";

/**
 * The page AI in Inställningar (Story 17.5), read inside its own <Suspense>
 * (AD-18). Someone it is not shown to is sent to the start page, and when
 * the choice cannot be read a notice says so (the jobs use the default).
 */
export async function AiContent() {
  await requireUserOrRedirect("/installningar");
  let view: AiSettingsView | null;
  try {
    view = await getAiSettingsView();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_ai_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.settings_unavailable}</Notice>;
  }
  // Not shown to this user (Story 17.5): the page does not exist for them.
  if (!view) redirect("/installningar");
  return <AiSettings view={view} />;
}
