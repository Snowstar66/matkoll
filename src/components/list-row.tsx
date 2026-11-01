import Link, { type LinkProps } from "next/link";
import type { AriaAttributes, ReactNode, Ref } from "react";
import { cx } from "./cx";

type DataAttributes = { [key: `data-${string}`]: string | number | boolean | undefined };

/** What a press on the row's text does: run `onPress`, follow `href`, or nothing. */
type Press =
  | { onPress: () => void; href?: never }
  | { href: string; onPress?: never }
  | { onPress?: never; href?: never };

/** Attributes for the press target. `prefetch` applies to a link only. */
export type ListRowPressProps = DataAttributes &
  Pick<
    AriaAttributes,
    "aria-haspopup" | "aria-describedby" | "aria-expanded" | "aria-controls" | "aria-current" | "aria-label"
  > & { prefetch?: LinkProps["prefetch"] };

export type ListRowProps = DataAttributes &
  Press & {
    /**
     * The name, in row-title type; wraps onto more lines when long. May hold
     * the amount in a span of its own. With `onPress` or `href` it must not be
     * empty, or `pressProps["aria-label"]` must name the target.
     */
    title: ReactNode;
    /** The line under the name in meta type and ink-3, at most two lines with "…"; screen readers get all of it. Shown unless null, undefined or "". */
    meta?: ReactNode;
    /** Left of the text, e.g. a `CheckCircle`. A control of its own, never inside the press target. */
    leading?: ReactNode;
    /** Right of the text, e.g. a `TrashButton` or a product chip. A control of its own, never inside the press target. */
    trailing?: ReactNode;
    /** Ticked off ("I korgen"): the name struck through and both lines in ink-3. Say so in `srStatus` too. */
    crossedOut?: boolean;
    /** A state for screen readers only, read after the name: "i korgen". Never shown. */
    srStatus?: string;
    /** `li` in a `ListGroup` (default); `div` inside a wrapper of the caller's, e.g. `<li><SwipeRow>`. */
    as?: "li" | "div";
    /** Attributes for the press target (the button or link), e.g. `data-testid`, `aria-haspopup` or `aria-expanded`. */
    pressProps?: ListRowPressProps;
    /** A ref to the press target (the button or link), e.g. to move focus back to the row. */
    pressRef?: Ref<HTMLElement>;
    /** Calm rows (Story 19.7): the name in regular weight (17/400) instead of 500. */
    plain?: boolean;
    /** The line under the name on one line with "…" (Story 19.7), instead of at most two. */
    oneLine?: boolean;
    /** A row 52 px high instead of 56 (Matvaror, Story 19.7). */
    compact?: boolean;
    className?: string;
  };

/** Whether a title would leave the press target without a name. */
function isEmptyTitle(title: ReactNode): boolean {
  return title === null || title === undefined || title === false || (typeof title === "string" && title.trim() === "");
}

/**
 * Listrad (DESIGN.md, list-row; UX-DR24, UX-DR25): at least 56 px high, with
 * the name and the line under it, an optional control to the left and one to
 * the right. With `onPress` or `href` the text is a button or link that fills
 * the row between the controls, so its name is the row's text ("Mellanmjölk
 * Arla laktosfri", read with a pause between the lines); without either (or
 * with an empty `href`) it is plain text. The line under the name stops at
 * two lines with "…" on screen only: the whole text stays in the DOM for
 * screen readers. Dividers come from the `ListGroup`; every focus ring in the
 * row is drawn inside its control, so the group's round corners never clip it.
 */
export function ListRow(props: ListRowProps) {
  const {
    title,
    meta,
    leading,
    trailing,
    crossedOut = false,
    srStatus,
    as: Root = "li",
    pressProps,
    pressRef,
    plain = false,
    oneLine = false,
    compact = false,
    className,
    onPress,
    href,
    ...data
  } = props;

  const pressable = Boolean(onPress) || Boolean(href);
  if (onPress && href) {
    console.warn("ListRow: both onPress and href are set; onPress wins. Pass one of them.");
  }
  if (pressable && isEmptyTitle(title) && !pressProps?.["aria-label"]) {
    console.warn('ListRow: a row with onPress or href needs a title or pressProps["aria-label"].');
  }

  const hasMeta = meta !== null && meta !== undefined && meta !== "";
  const text = (
    <>
      <span className={cx("block text-row-title wrap-break-word", plain && "font-normal", crossedOut ? "text-ink-3 line-through" : "text-ink")}>
        {title}
        {srStatus ? (
          <>
            {" "}
            <span className="sr-only">{srStatus}</span>
          </>
        ) : null}
      </span>
      {hasMeta ? (
        <>
          {/* Keeps the name and the line under it apart in the accessible name; the two blocks give the pause. */}{" "}
          <span className={cx("mt-0.5 block wrap-break-word text-meta text-ink-3", oneLine ? "truncate" : "line-clamp-2")}>{meta}</span>
        </>
      ) : null}
    </>
  );
  const textClasses = cx(
    "flex min-w-0 flex-1 flex-col justify-center py-3 text-left",
    leading ? "pl-1" : "pl-4",
    trailing ? "pr-2" : "pr-4",
  );
  const pressClasses = cx(textClasses, "focus-visible:-outline-offset-2");
  const { prefetch, ...targetProps } = pressProps ?? {};
  // Slot controls draw their focus ring inside themselves too.
  const slot = "flex shrink-0 items-center [&_*:focus-visible]:-outline-offset-2";

  return (
    <Root {...data} className={cx("flex items-stretch", compact ? "min-h-[52px]" : "min-h-row", className)}>
      {leading ? <div className={cx(slot, "pl-2")}>{leading}</div> : null}
      {onPress ? (
        <button
          {...targetProps}
          ref={pressRef as Ref<HTMLButtonElement> | undefined}
          type="button"
          onClick={onPress}
          className={pressClasses}
        >
          {text}
        </button>
      ) : href ? (
        <Link
          {...targetProps}
          ref={pressRef as Ref<HTMLAnchorElement> | undefined}
          href={href}
          prefetch={prefetch}
          className={pressClasses}
        >
          {text}
        </Link>
      ) : (
        <div className={textClasses}>{text}</div>
      )}
      {trailing ? <div className={cx(slot, "pr-2")}>{trailing}</div> : null}
    </Root>
  );
}
