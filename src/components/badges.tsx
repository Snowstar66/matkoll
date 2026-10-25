import type { ReactNode } from "react";
import { cx } from "./cx";

const badge = "inline-flex items-center self-start rounded-sm px-[9px] py-[3px] text-badge";

export type StatusBadgeProps = {
  /** `ok` = "Kan lagas nu" (mint), `missing` = "Saknar N varor" (light blue). */
  status: "ok" | "missing";
  /** The status in words; colour never carries it alone. */
  children: ReactNode;
  className?: string;
};

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <span className={cx(badge, status === "ok" ? "bg-mint text-mint-ink" : "bg-sky text-sky-ink", className)}>
      {children}
    </span>
  );
}

/** The sand label that marks AI content until it is saved. */
export function AiBadge({ className }: { className?: string }) {
  return <span className={cx(badge, "bg-sand text-sand-ink", className)}>AI-förslag</span>;
}
