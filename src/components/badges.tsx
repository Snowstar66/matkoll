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

export type BadgeProps = {
  /**
   * mint = done, sky = missing or check this, sand = from the AI (DESIGN.md, Colors);
   * neutral = a plain fact with no status, e.g. "Ny".
   */
  tone: "mint" | "sky" | "sand" | "neutral";
  children: ReactNode;
  className?: string;
};

const tones: Record<BadgeProps["tone"], string> = {
  mint: "bg-mint text-mint-ink",
  sky: "bg-sky text-sky-ink",
  sand: "bg-sand text-sand-ink",
  neutral: "border border-border bg-surface text-ink-2",
};

/** A short label in one of the three status colours, e.g. "Kontrollera" or "Ny". */
export function Badge({ tone, children, className }: BadgeProps) {
  return <span className={cx(badge, tones[tone], className)}>{children}</span>;
}

/** The sand label that marks AI content until it is saved. */
export function AiBadge({ className }: { className?: string }) {
  return <span className={cx(badge, "bg-sand text-sand-ink", className)}>AI-förslag</span>;
}
