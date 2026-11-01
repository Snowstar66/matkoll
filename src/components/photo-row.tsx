import { type ReactNode, type Ref } from "react";
import { cx } from "./cx";
import { CameraIcon } from "./icons";

// The quiet camera row (Story 14.6): a card with an icon tile, the action's
// title, a sub line and a chevron, like the shopping row in Matsedel. The
// title button covers the whole card (stretched). The sub line lets taps through
// to it, except on a link or button in it (such as "Visa"), which stays on top. Shared by Lagersaldo's
// "Fotografera kylen" and a Prylar place's "Ta ett nytt kort".

export type PhotoRowProps = {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** Hidden, not unmounted, so the sub line keeps its state. */
  hidden?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  /** "primary" (Story 18.11): the accent card that is the first and clearest row of a page. */
  variant?: "default" | "primary";
  /** The sub line under the title. */
  children?: ReactNode;
};

export function PhotoRow({ title, onClick, disabled, hidden, buttonRef, variant = "default", children }: PhotoRowProps) {
  const primary = variant === "primary";
  return (
    <div hidden={hidden} className={cx("relative flex min-h-tap items-center gap-3 rounded-lg px-3.5 py-3", primary ? "bg-accent" : "bg-surface", hidden && "hidden")}>
      <span aria-hidden="true" className={cx("flex size-8 shrink-0 items-center justify-center rounded-md", primary ? "bg-on-accent/20" : "bg-sky")}>
        <CameraIcon size={20} className={primary ? "text-on-accent" : "text-sky-ink"} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={cx("-my-3 cursor-pointer py-3 text-left text-row-title wrap-break-word outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent disabled:cursor-not-allowed disabled:opacity-60", primary ? "text-on-accent focus-visible:after:outline-on-accent" : "text-ink")}
        >
          {title}
        </button>
        <div className="pointer-events-none [&_a]:pointer-events-auto [&_a]:relative [&_a]:z-10 [&_button]:pointer-events-auto [&_button]:relative [&_button]:z-10">{children}</div>
      </div>
      <span aria-hidden="true" className={cx("text-row-title", primary ? "text-on-accent" : "text-ink-3")}>
        ›
      </span>
    </div>
  );
}
