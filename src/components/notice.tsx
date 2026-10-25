import type { ReactNode } from "react";
import { cx } from "./cx";
import { InfoIcon } from "./icons";

export type NoticeProps = {
  children: ReactNode;
  /** A way forward, e.g. a `<Button variant="text">` or a link. Shown under the text. */
  action?: ReactNode;
  /**
   * `alert` for a problem that appears while the page is in use or is there on load;
   * leave it out when the notice is part of the page's normal content.
   */
  role?: "alert" | "status";
  className?: string;
};

/**
 * Meddelanderuta: persistent, light blue, with the "i" icon. Shown at the top of the
 * area where the problem happened and removed by the caller once it is solved.
 * Used for warnings and errors alike (no red).
 */
export function Notice({ children, action, role, className }: NoticeProps) {
  return (
    <div className={cx("flex gap-3 rounded-md bg-sky p-4 text-body text-sky-ink", className)}>
      <InfoIcon size={22} className="mt-px shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p role={role}>{children}</p>
        {action ? <div className="-ml-3 [&_a]:text-sky-ink [&_button]:text-sky-ink">{action}</div> : null}
      </div>
    </div>
  );
}
