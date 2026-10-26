import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";
import { TrashIcon } from "./icons";

export type TrashButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "aria-label" | "children" | "onClick" | "type"
> & {
  /** The button's name for screen readers, with the item: "Ta bort Gräddfil". */
  label: string;
  /** Removes the item at once; no question first, "Ångra" in the toast instead. */
  onPress: () => void;
  disabled?: boolean;
};

/**
 * Soptunna (DESIGN.md, trash-button; UX-DR24): a grey line-icon bin in a
 * 44 × 44 px tap area, without a border, that turns hairline on hover and
 * press. Never red. The caller removes the item at once and offers "Ångra";
 * a `ref` lets it move focus to the next row's bin afterwards. Other button
 * attributes (`data-*`, `id`, `className`) pass through.
 */
export function TrashButton({ label, onPress, disabled, className, ...rest }: TrashButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={cx(
        "flex size-tap shrink-0 items-center justify-center rounded-md text-ink-3 enabled:hover:bg-hairline enabled:active:bg-hairline disabled:opacity-50",
        className,
      )}
    >
      <TrashIcon size={22} />
    </button>
  );
}
