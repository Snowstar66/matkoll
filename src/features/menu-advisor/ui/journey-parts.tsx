import Link from "next/link";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "@/components/cx";
import { CheckIcon, ChevronLeftIcon } from "@/components/icons";
import { Segment } from "@/components/segment";

// Pieces the screens of "En enkel resa" share: the one back link at the top, the big headline (the screen's only
// title), a card you choose with one tap (a real radio underneath, so the keyboard and screen readers work), the
// body of a stop, and the footer that stays at the bottom.

export function Headline({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 pt-2">
      <h1 className="text-tour-title font-bold text-ink">{children}</h1>
      {sub ? <p className="text-headline text-ink-2">{sub}</p> : null}
    </header>
  );
}

const topBackClass = "-mt-1 -ml-2 flex min-h-tap min-w-tap items-center gap-1 self-start rounded-md px-2 text-body text-accent desktop:mt-0";

/**
 * The one back link of a screen, green at the top where the page header's link stands elsewhere in the app. Its
 * words say where it goes: "Matsedel" on the start, "Tolka menyn" from the answer, "Förslag" from Ert val. A link
 * with `href`, else a button. Without children it only keeps the header's air (the reading screen has no way back
 * but Avbryt).
 */
export function TopBack({ href, onClick, children }: { href?: string; onClick?: () => void; children?: ReactNode }) {
  const inner = (
    <>
      <ChevronLeftIcon size={20} />
      {children}
    </>
  );
  return (
    <div className="flex flex-col pt-header-top desktop:pt-10">
      {children === undefined ? null : href ? (
        <Link href={href} scroll={false} className={topBackClass}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={topBackClass}>
          {inner}
        </button>
      )}
    </div>
  );
}

export type AnswerTab = "answer" | "menu";

/** "Förslag | Hela menyn" at the top of the answer: one photo gives both, the whole menu is the second tab. */
export function AnswerTabs({ value, onChange }: { value: AnswerTab; onChange: (tab: AnswerTab) => void }) {
  return (
    <Segment
      label="Visa"
      value={value}
      onChange={onChange}
      options={[
        { value: "answer", label: "Förslag" },
        { value: "menu", label: "Hela menyn" },
      ]}
    />
  );
}

/** A stop: an icon on a round mint plate, the title centred, one sentence. Never red. */
export function StopBody({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 pt-6 text-center">
      <span aria-hidden="true" className="flex size-18 items-center justify-center rounded-full bg-mint text-mint-ink">
        {icon}
      </span>
      <h1 className="text-section-title font-bold text-ink wrap-break-word">{title}</h1>
      {children ? <p className="max-w-80 text-headline font-normal text-ink-2 wrap-break-word">{children}</p> : null}
    </div>
  );
}

/** A quiet text link-button, 44 px tall. */
export function TextLink({ children, className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button type={type} className={cx("inline-flex min-h-tap items-center justify-center rounded-md px-3 text-body font-medium text-ink-2 underline-offset-4 hover:underline", className)} {...props}>
      {children}
    </button>
  );
}

/**
 * One choice among several: a large rounded card. The chosen one has a green frame and a check; the others are toned.
 * `tone="danger"` is the card of a dish someone cannot eat: a quiet red wash and a red frame, chosen or not.
 */
export function RadioCard({
  name,
  value,
  checked,
  onSelect,
  tone = "default",
  children,
  aside,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  tone?: "default" | "danger";
  children: ReactNode;
  /** The price, on the right. */
  aside?: ReactNode;
}) {
  const danger = tone === "danger";
  return (
    <label
      className={cx(
        "relative flex min-h-tap cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        danger ? "bg-danger-tint" : "bg-surface",
        checked ? (danger ? "border-danger" : "border-accent") : danger ? "border-danger/40" : "border-transparent",
        !checked && !danger && "text-ink-2",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill border-2",
          checked ? (danger ? "border-danger bg-surface text-danger" : "border-accent bg-accent text-on-accent") : "border-ink-3 bg-surface",
        )}
      >
        {checked ? danger ? <span className="size-2.5 rounded-pill bg-danger" /> : <CheckIcon size={14} /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      {aside ? <span className={cx("shrink-0 text-row-title", checked ? "text-ink" : "text-ink-2")}>{aside}</span> : null}
    </label>
  );
}

/** The one primary button of a screen: wide, pill-shaped, 56 px tall at least. */
export function BigButton({ children, className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-pill bg-accent px-6 text-headline font-semibold text-on-accent select-none disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** "Ni landar på" and the sum, big. */
export function TotalRow({ label = "Ni landar på", sek, note }: { label?: string; sek: number; note?: string | null }) {
  return (
    <div className="mb-1 flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-ink-2">{label}</span>
        <b data-testid="menu-total" className="text-[1.75rem] leading-8 font-bold text-ink">{`ca ${Math.round(sek)} kr`}</b>
      </div>
      {note ? <span className="text-right text-meta text-ink-3">{note}</span> : null}
    </div>
  );
}

/** What stays at the bottom while the page above scrolls: just above the tab bar. */
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div data-testid="menu-footer" className="sticky bottom-[var(--tab-bar-height)] z-10 -mx-page mt-auto flex flex-col gap-1 bg-bg px-page pt-3 pb-2 desktop:bottom-0">
      {children}
    </div>
  );
}
