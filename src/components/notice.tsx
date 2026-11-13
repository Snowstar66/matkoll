import type { ReactNode } from "react";
import { cx } from "./cx";
import { CloseIcon, InfoIcon } from "./icons";

export type NoticeProps = {
  children: ReactNode;
  /** A way forward, e.g. a `<Button variant="text">` or a link. Shown under the text. */
  action?: ReactNode;
  /**
   * `alert` for a problem that appears while the page is in use or is there on load;
   * leave it out when the notice is part of the page's normal content.
   */
  role?: "alert" | "status";
  /** Makes the notice dismissible: a close button "Stäng" (44 px tap area) calls it; the caller removes the notice. */
  onDismiss?: () => void;
  className?: string;
};

/**
 * Meddelanderuta: persistent, light blue, with the "i" icon. Shown at the top of the
 * area where the problem happened and removed by the caller once it is solved (or
 * by the user, with `onDismiss`).
 * Used for warnings and errors alike (no red).
 */
export function Notice({ children, action, role, onDismiss, className }: NoticeProps) {
  return (
    <div className={cx("flex gap-3 rounded-md bg-sky p-4 text-body text-sky-ink", className)}>
      <InfoIcon size={22} className="mt-px shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p role={role}>{children}</p>
        {action ? <div className="-ml-3 [&_a]:text-sky-ink [&_button]:text-sky-ink">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Stäng"
          onClick={onDismiss}
          className="-m-3 flex min-h-tap min-w-tap shrink-0 items-center justify-center self-start rounded-full text-sky-ink"
        >
          <CloseIcon size={20} />
        </button>
      ) : null}
    </div>
  );
}
