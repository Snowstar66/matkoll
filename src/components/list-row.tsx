import Link from "next/link";
import type { AriaAttributes, ReactNode } from "react";
import { cx } from "./cx";

type DataAttributes = { [key: `data-${string}`]: string | number | boolean | undefined };

/** What a press on the row's text does: run `onPress`, follow `href`, or nothing. */
type Press =
  | { onPress: () => void; href?: never }
  | { href: string; onPress?: never }
  | { onPress?: never; href?: never };

export type ListRowProps = DataAttributes &
  Press & {
    /** The name, in row-title type; wraps onto more lines when long. May hold the amount in a span of its own. */
    title: ReactNode;
    /** The line under the name in meta type and ink-3, on one line with "…"; screen readers get all of it. */
    meta?: ReactNode;
    /** Left of the text, e.g. a `CheckCircle`. A control of its own, never inside the press target. */
    leading?: ReactNode;
    /** Right of the text, e.g. a `TrashButton` or a product chip. A control of its own, never inside the press target. */
    trailing?: ReactNode;
    /** Ticked off ("I korgen"): the name struck through and both lines in ink-3. */
    crossedOut?: boolean;
    /** `li` in a `ListGroup` (default); `div` inside a wrapper of the caller's, e.g. `<li><SwipeRow>`. */
    as?: "li" | "div";
    /** Attributes for the press target (the button or link), e.g. `data-testid` or `aria-haspopup`. */
    pressProps?: DataAttributes & Pick<AriaAttributes, "aria-haspopup" | "aria-describedby">;
    className?: string;
  };

/**
 * Listrad (DESIGN.md, list-row; UX-DR24, UX-DR25): at least 56 px high, with
 * the name and the line under it, an optional control to the left and one to
 * the right. With `onPress` or `href` the text is a button or link that fills
 * the row between the controls, so its name is the row's text ("Mellanmjölk
 * Arla laktosfri", read with a pause between the lines); without either it is plain text. The line under the name
 * is cut with "…" on screen only: the whole text stays in the DOM for screen
 * readers. Dividers come from the `ListGroup`; the focus ring is drawn
 * inside the row, so the group's round corners never clip it.
 */
export function ListRow(props: ListRowProps) {
  const {
    title,
    meta,
    leading,
    trailing,
    crossedOut = false,
    as: Root = "li",
    pressProps,
    className,
    onPress,
    href,
    ...data
  } = props;

  const text = (
    <>
      <span className={cx("block text-row-title wrap-break-word", crossedOut ? "text-ink-3 line-through" : "text-ink")}>
        {title}
      </span>
      {meta ? (
        <>
          {/* Keeps the name and the line under it apart in the accessible name; the two blocks give the pause. */}{" "}
          <span className="mt-0.5 block truncate text-meta text-ink-3">{meta}</span>
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

  return (
    <Root {...data} className={cx("flex min-h-row items-stretch", className)}>
      {leading ? <div className="flex shrink-0 items-center pl-2">{leading}</div> : null}
      {onPress ? (
        <button {...pressProps} type="button" onClick={onPress} className={pressClasses}>
          {text}
        </button>
      ) : href !== undefined ? (
        <Link {...pressProps} href={href} className={pressClasses}>
          {text}
        </Link>
      ) : (
        <div className={textClasses}>{text}</div>
      )}
      {trailing ? <div className="flex shrink-0 items-center pr-2">{trailing}</div> : null}
    </Root>
  );
}
