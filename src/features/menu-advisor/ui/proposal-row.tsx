import type { ReactNode } from "react";
import { TrashIcon } from "@/components/icons";

/** A proposal card with its soptunna at the right: the one way to take a proposal away. */
export function ProposalRow({ onRemove, removeLabel, children }: { onRemove: () => void; removeLabel: string; children: ReactNode }) {
  return (
    <div data-testid="menu-proposal-row" className="flex items-stretch gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        data-testid="menu-dismiss-proposal"
        aria-label={removeLabel}
        onClick={onRemove}
        className="flex size-tap shrink-0 items-center justify-center self-center rounded-pill text-ink-3"
      >
        <TrashIcon size={18} />
      </button>
    </div>
  );
}
