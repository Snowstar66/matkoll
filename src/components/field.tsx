import type { ComponentPropsWithRef, HTMLAttributes, LabelHTMLAttributes } from "react";
import { cx } from "./cx";

/** Classes for a text field (Story 19.4): at least 16 px text so iPhone Safari does not zoom, 48 px high, a `--border` line and corner 12. */
export const inputClasses =
  "h-12 w-full rounded-md border border-border bg-surface px-4 text-body text-ink placeholder:text-ink-3 aria-[invalid=true]:border-sky-ink";

export type InputProps = ComponentPropsWithRef<"input">;

/** A text field. Pair it with a visible `<label>` (or `FieldLabel`) through `id`. */
export function Input({ className, ...props }: InputProps) {
  return <input className={cx(inputClasses, className)} {...props} />;
}

/**
 * The label above a field. `optional` adds "(valfritt)" in 400 `--ink-2` after it (Story 19.5); the
 * mark sits beside the label, so the label's own text, and the field's name, stay as they were.
 */
export function FieldLabel({ className, optional = false, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { optional?: boolean }) {
  const label = <label className={cx("text-control text-ink", className)} {...props} />;
  if (!optional) return label;
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      {label}
      <span className="text-control font-normal text-ink-2">(valfritt)</span>
    </span>
  );
}

/** A validation message under a field: light-blue ink, never red. */
export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("text-meta text-sky-ink", className)} {...props} />;
}
