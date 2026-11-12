import Link from "next/link";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "@/components/cx";
import { ChevronLeftIcon } from "@/components/icons";

// Pieces the screens of Startrecept share (the sketch "Kom igång med recept", 2026-11-11): the one back
// link at the top, the screen's big title, the body of a stop (an icon on a round plate, never red),
// the one green button and the quiet text link under it, and the footer that stays at the bottom.

const backClass = "-mt-1 -ml-2 flex min-h-tap min-w-tap items-center gap-1 self-start rounded-md px-2 text-body text-accent desktop:mt-0";

/** "‹ Recept" at the top; without `href` only the header's air (the screens with no way back but their own). */
export function StarterBack({ href }: { href?: string }) {
  return (
    <div className="flex flex-col pt-header-top desktop:pt-10">
      {href ? (
        <Link href={href} className={backClass}>
          <ChevronLeftIcon size={20} />
          Recept
        </Link>
      ) : null}
    </div>
  );
}

/** The screen's one title, with a line under it. */
export function StarterTitle({ children, sub, id }: { children: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 id={id} tabIndex={-1} className="text-page-title text-ink outline-none wrap-break-word">
        {children}
      </h1>
      {sub ? <p className="text-body text-ink-2 wrap-break-word">{sub}</p> : null}
    </header>
  );
}

/** A stop: an icon on a round plate (mint, sky or sand), the title centred, one sentence. Never red. */
export function StarterStop({ icon, tone = "mint", title, children }: { icon: ReactNode; tone?: "mint" | "sky" | "sand"; title: string; children?: ReactNode }) {
  const plate = tone === "sky" ? "bg-sky text-sky-ink" : tone === "sand" ? "bg-sand text-sand-ink" : "bg-mint text-mint-ink";
  return (
    <div className="flex flex-col items-center gap-3 px-2 pt-16 text-center" data-testid="starter-stop">
      <span aria-hidden="true" className={cx("flex size-18 items-center justify-center rounded-full", plate)}>
        {icon}
      </span>
      <h1 tabIndex={-1} className="text-section-title font-bold text-ink outline-none wrap-break-word">
        {title}
      </h1>
      {children ? <p className="max-w-80 text-headline font-normal text-ink-2 wrap-break-word">{children}</p> : null}
    </div>
  );
}

/** The one green button of a screen: wide, pill-shaped, 56 px tall at least. */
export function StarterButton({ children, className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-pill bg-accent px-6 text-headline font-semibold text-on-accent select-none disabled:cursor-not-allowed disabled:bg-fill disabled:text-ink-3",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** The same, as a link. */
export function StarterButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-pill bg-accent px-6 text-headline font-semibold text-on-accent select-none"
    >
      {children}
    </Link>
  );
}

/** A quiet text link-button, 44 px tall. */
export function StarterTextButton({ children, className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button
      type={type}
      className={cx("inline-flex min-h-tap items-center justify-center rounded-md px-3 text-body font-medium text-ink-2 underline-offset-4 hover:underline disabled:opacity-60", className)}
      {...props}
    >
      {children}
    </button>
  );
}

/** The same, as a link. */
export function StarterTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-tap items-center justify-center rounded-md px-3 text-body font-medium text-ink-2 underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/** What stays at the bottom while the page above scrolls: just above the tab bar. */
export function StarterFooter({ children }: { children: ReactNode }) {
  return (
    <div data-testid="starter-footer" className="sticky bottom-[var(--tab-bar-height)] z-10 -mx-page mt-auto flex flex-col items-center gap-1 bg-bg px-page pt-3 pb-2 desktop:bottom-0">
      {children}
    </div>
  );
}

/** The screen's frame: the column the footer sticks to the bottom of. */
export function StarterScreen({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="flex min-h-[calc(100dvh-var(--tab-bar-height)-1rem)] flex-1 flex-col gap-4 desktop:min-h-[calc(100dvh-4rem)]" data-testid={testId}>
      {children}
    </div>
  );
}
