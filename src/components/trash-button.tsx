import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";
import { TrashIcon } from "./icons";

/**
 * A second pointer press on any bin this soon after the last one is ignored.
 * When a row is removed, the next row's bin slides up under the finger, and a
 * double tap would remove that item too, without a question. A press from the
 * keyboard or a screen reader (a click without a pointer, `detail` 0) is
 * never ignored.
 */
export const trashPressGuardMs = 400;

/** When a bin was last pressed with a pointer; shared by every bin on the page. */
let lastPressAt = Number.NEGATIVE_INFINITY;

/** Marks every bin, so `focusAfterRemoval` can find the next one. */
const binSelector = "[data-trash-button]";

/** How a bin was pressed. */
export type TrashPress = {
  /** A tap or a mouse click (`detail` above 0); false for Enter, Space or a screen reader's activation. */
  pointer: boolean;
};

export type TrashButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "aria-label" | "aria-labelledby" | "title" | "children" | "onClick" | "type"
> & {
  /** The button's name for screen readers, with the item: "Ta bort Gräddfil". */
  label: string;
  /**
   * Removes the item at once; no question first, "Ångra" in the toast
   * instead. Gets the bin itself, e.g. for `focusAfterRemoval(bin)`, and how
   * it was pressed: `pointer` for a tap or click, not for the keyboard or a
   * screen reader's activation.
   */
  onPress: (bin: HTMLButtonElement, press: TrashPress) => void;
  disabled?: boolean;
};

/**
 * Soptunna (DESIGN.md, trash-button; UX-DR24): a grey line-icon bin in a
 * 44 × 44 px tap area, without a border, that turns hairline on hover and
 * press. Never red. The caller removes the item at once and offers "Ångra",
 * then moves focus with `focusAfterRemoval`. A second pointer press on any
 * bin within `trashPressGuardMs` is ignored; the keyboard is never ignored. The focus ring is drawn inside the
 * button, so a list group's round corners never clip it. Other button
 * attributes (`ref`, `data-*`, `id`, `className`, `aria-describedby`) pass
 * through.
 */
export function TrashButton({ label, onPress, disabled, className, ...rest }: TrashButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      data-trash-button=""
      disabled={disabled}
      onClick={(event) => {
        const pointer = event.detail > 0;
        if (pointer) {
          const now = performance.now();
          if (now - lastPressAt < trashPressGuardMs) return;
          lastPressAt = now;
        }
        onPress(event.currentTarget, { pointer });
      }}
      className={cx(
        "flex size-tap shrink-0 items-center justify-center rounded-md text-ink-3 focus-visible:-outline-offset-2 enabled:hover:bg-hairline enabled:active:bg-hairline disabled:opacity-50",
        className,
      )}
    >
      <TrashIcon size={22} />
    </button>
  );
}

/** Focuses an element that may not take focus by itself, such as a heading. */
function focusHeading(heading: HTMLElement): void {
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus();
}

/**
 * Moves focus after a row is removed with its bin (EXPERIENCE.md,
 * Soptunna): to the next bin on the page, else the previous one, else the
 * heading of the removed row's list (`aria-labelledby` on its `ListGroup`),
 * else the page heading (`h1`). Call it with the pressed bin, or the row that
 * holds it, before or after asking for the removal: a bin is focused at
 * once, and a heading on the next frame, when the row (and an emptied
 * category) is gone.
 */
export function focusAfterRemoval(removed: Element | null, root: ParentNode = document): void {
  if (!removed) return;
  const bin = removed.matches(binSelector) ? removed : removed.querySelector(binSelector);
  const bins = [...root.querySelectorAll<HTMLButtonElement>(binSelector)].filter(
    (other) => other === bin || (!other.disabled && !removed.contains(other)),
  );
  const index = bin ? bins.indexOf(bin as HTMLButtonElement) : -1;
  if (index >= 0) {
    const neighbour = bins[index + 1] ?? bins[index - 1];
    if (neighbour) {
      neighbour.focus();
      return;
    }
  }

  const listHeadingId = removed.closest("ul, ol, [role='list']")?.getAttribute("aria-labelledby");
  requestAnimationFrame(() => {
    // Looked up by id after the removal: the heading may have been rendered anew.
    const listHeading = listHeadingId ? document.getElementById(listHeadingId) : null;
    const target = [listHeading, document.querySelector<HTMLElement>("h1")].find((element) => element?.isConnected);
    if (target) focusHeading(target);
  });
}
