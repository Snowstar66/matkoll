import { requireUserOrRedirect } from "@/features/auth/server";
import type { Store } from "@/features/settings";
import { listStores, SettingsDataError } from "@/features/settings/server";
import { StoreSettings, StoreSettingsUnavailable } from "@/features/settings/ui/store-settings";

/**
 * The section Butik in Inställningar (FR-28), read inside its own <Suspense>
 * (AD-18). When the stores cannot be read, only this section shows the
 * Notice (`settings_store_unavailable`, logged with the reason alone); other
 * errors are bugs and go to the error boundary.
 */
export async function StoreContent() {
  await requireUserOrRedirect("/installningar");
  let stores: Store[];
  try {
    stores = await listStores();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_store_unavailable", { reason: error.detail });
    return <StoreSettingsUnavailable />;
  }
  return <StoreSettings stores={stores} />;
}
