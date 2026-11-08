"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useConfirmDelete } from "@/components/confirm-delete";
import { SwitchRow } from "@/components/switch-row";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { setShareAllRecipes, stopSharingAllRecipes } from "../actions/share-recipe";
import { stopSharingDetail, stopSharingQuestion } from "../domain/shared-recipe";

export type RecipeSharing = { shareAll: boolean; sharedCount: number };

/**
 * Tillval, the group Delade recept (last on the page): the device's "Visa delade recept" (`showRow`,
 * from the page), and the household's "Dela alla mina recept" and "Sluta dela alla" (with how many
 * are shared, only when any is). Sluta dela alla asks first, in grey and ink rather than red, since
 * sharing again undoes it; it turns Dela alla off too. Without `sharing` (it could not be read) only
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

  return (
    <div className="mt-6 mb-2" data-testid="shared-group">
      {dialog}
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
              void run(() => setShareAllRecipes(share), ({ sharedCount }) => ({ shareAll: share, sharedCount }));
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
                  onConfirm: () => run(stopSharingAllRecipes, () => ({ shareAll: false, sharedCount: 0 })),
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
