import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "@/components/cx";
import { ChevronLeftIcon, ExternalIcon } from "@/components/icons";
import { texts } from "./format";

// Small pieces the screens of the restaurant agent share (a copy of the look of Menyrådgivarens resa; features do not import each other, AD-1).

export function Headline({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 pt-2">
      <h2 className="text-tour-title font-bold text-ink wrap-break-word">{children}</h2>
      {sub ? <p className="text-headline text-ink-2 wrap-break-word">{sub}</p> : null}
    </header>
  );
}

export function BackLink({ onClick, children = texts.back }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 flex min-h-tap min-w-tap items-center gap-1 self-start rounded-md px-2 text-body text-ink-2">
      <ChevronLeftIcon size={20} />
      {children}
    </button>
  );
}

export function BigButton({ children, className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button
      type={type}
      className={cx("inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-pill bg-accent px-6 text-headline font-semibold text-on-accent select-none disabled:cursor-not-allowed disabled:opacity-60", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button type={type} className={cx("inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-pill border border-border bg-surface px-5 text-body font-semibold text-accent select-none disabled:cursor-not-allowed disabled:opacity-60", className)} {...props}>
      {children}
    </button>
  );
}

export function TextLink({ children, className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button type={type} className={cx("inline-flex min-h-tap items-center justify-center rounded-md px-3 text-body font-medium text-ink-2 underline-offset-4 hover:underline", className)} {...props}>
      {children}
    </button>
  );
}

export function StickyFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-[var(--tab-bar-height)] z-10 -mx-page mt-auto flex flex-col gap-1 bg-bg px-page pt-3 pb-2 desktop:bottom-0">{children}</div>;
}

/** A stop: a round icon, a title, one explanation, then the way on. */
export function StopBody({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 pt-8 text-center">
      <span className="flex size-18 items-center justify-center rounded-full bg-mint text-mint-ink">{icon}</span>
      <h2 className="text-section-title font-semibold text-ink wrap-break-word">{title}</h2>
      <p className="max-w-80 text-body text-ink-2 wrap-break-word">{children}</p>
    </div>
  );
}

export const chipClass = "inline-flex min-h-7 items-center gap-1 rounded-pill px-2.5 py-0.5 text-badge font-semibold";

/** The small "opens outside the app" mark after the text of an external link. Named for screen readers, since the icon itself is decoration. */
export function ExternalMark() {
  return (
    <span role="img" aria-label="Öppnas utanför appen" className="inline-flex shrink-0" data-testid="external-mark">
      <ExternalIcon size={14} />
    </span>
  );
}

/** A link that leaves the app: a new tab or app, no referrer, and the mark after its text. */
export function ExternalLink({ href, className, children, testId }: { href: string; className?: string; children: ReactNode; testId?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} data-testid={testId}>
      {children}
      <ExternalMark />
    </a>
  );
}
