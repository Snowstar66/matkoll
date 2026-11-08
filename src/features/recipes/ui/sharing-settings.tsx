"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useConfirmDelete } from "@/components/confirm-delete";
import { SwitchRow } from "@/components/switch-row";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { setShareAllRecipes, stopSharingAllRecipes } from "../actions/share-recipe";
import { stopSharingDetail, stopSharingNowDetail, stopSharingNowQuestion, stopSharingQuestion } from "../domain/shared-recipe";
import { ShareNameSheet } from "./share-name-sheet";

export type RecipeSharing = { shareAll: boolean; sharedCount: number; nameIsDefault: boolean };

/**
 * Tillval, the group Delade recept (last on the page): the device's "Visa delade recept" (`showRow`,
 * from the page), and the household's "Dela alla mina recept" and "Sluta dela alla" (with how many
 * are shared, only when any is). Sluta dela alla asks first, in grey and ink rather than red, since
 * sharing again undoes it; it turns Dela alla off too. Turning Dela alla on while the household still has
 * its default name first asks what others should see it as ("Hoppa över" shares anyway); turning it
 * off while recipes are shared asks whether to stop sharing those too ("Behåll dem" only stops new
 * ones). Without `sharing` (it could not be read) only
 * the device's row is shown.
 */
export function SharingSettings({ showRow, sharing }: { showRow: ReactNode; sharing: RecipeSharing | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { requestDelete, dialog } = useConfirmDelete();
  // What this visit changed shows at once; the page's values catch up after the refresh.
  const [local, setLocal] = useState<RecipeSharing | null>(null);
  const [read, setRead] = useState(sharing);
  if (read !== sharing) {
    setRead(sharing);
    setLocal(null);
  }
  const [working, setWorking] = useState(false);
  const [asking, setAsking] = useState(false);
  const shown = local ?? sharing;

  async function run<T>(action: () => Promise<Result<T>>, next: (data: T) => RecipeSharing) {
    if (working) return;
    setWorking(true);
    let result: Result<T>;
    try {
      result = await action();
    } catch {
      result = fail("recipe_share_failed");
    }
    setWorking(false);
    if (result.ok) {
      setLocal(next(result.data));
      router.refresh();
    } else if (result.error.code === "unauthorized") router.refresh();
    else showToast(result.error.message, { role: "alert" });
  }

  /** The answer to the name sheet: shares everything, renaming first when a name was given. The message when it fails. */
  async function shareAllNamed(name: string | null): Promise<string | null> {
    let result: Result<{ sharedCount: number }>;
    try {
      result = await setShareAllRecipes(true, name ?? undefined);
    } catch {
      result = fail("recipe_share_failed");
    }
    if (result.ok) {
      setLocal({ shareAll: true, sharedCount: result.data.sharedCount, nameIsDefault: name === null ? (shown?.nameIsDefault ?? false) : false });
      router.refresh();
      return null;
    }
    if (result.error.code === "unauthorized") {
      router.refresh();
      return null;
    }
    return result.error.fields?.name ?? result.error.message;
  }

  return (
    <div className="mt-6 mb-2" data-testid="shared-group">
      {dialog}
      <ShareNameSheet open={asking} onClose={() => setAsking(false)} onSubmit={shareAllNamed} />
      <h2 className="mx-1 mb-2 text-section-label text-ink-2 uppercase">Delade recept</h2>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg bg-surface">
        {showRow}
        {shown ? (
          <SwitchRow
            label="Dela alla mina recept"
            hint="Även nya recept. Annars väljer du per recept."
            on={shown.shareAll}
            disabled={working}
            onToggle={() => {
              const share = !shown.shareAll;
              const keepName = shown.nameIsDefault;
              if (share && keepName) {
                setAsking(true);
                return;
              }
              const turnOff = () => run(() => setShareAllRecipes(share), ({ sharedCount }) => ({ shareAll: share, sharedCount, nameIsDefault: keepName }));
              if (!share && shown.sharedCount > 0) {
                requestDelete({
                  question: stopSharingNowQuestion,
                  detail: stopSharingNowDetail(shown.sharedCount),
                  confirmLabel: "Sluta dela alla",
                  undoable: true,
                  onConfirm: () => run(stopSharingAllRecipes, () => ({ shareAll: false, sharedCount: 0, nameIsDefault: keepName })),
                  secondaryLabel: "Behåll dem",
                  onSecondary: turnOff,
                });
                return;
              }
              void turnOff();
            }}
          />
        ) : null}
        {shown && shown.sharedCount > 0 ? (
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              disabled={working}
              onClick={() =>
                requestDelete({
                  question: stopSharingQuestion,
                  detail: stopSharingDetail(shown.sharedCount),
                  confirmLabel: "Sluta dela",
                  undoable: true,
                  onConfirm: () => run(stopSharingAllRecipes, () => ({ shareAll: false, sharedCount: 0, nameIsDefault: shown.nameIsDefault })),
                })
              }
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
            >
              <span className="min-w-0 flex-1 text-body text-ink">Sluta dela alla</span>
              <span className="shrink-0 text-body text-ink-2 tabular-nums" data-testid="shared-count">
                {shown.sharedCount} recept
              </span>
            </button>
          </li>
        ) : null}
      </ul>
      <p className="mx-1 mt-2 text-meta text-ink-3">Dela alla och Sluta dela alla gäller hela hushållet.</p>
    </div>
  );
}
