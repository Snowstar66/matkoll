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

/** The label above a field. */
export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("text-control text-ink", className)} {...props} />;
}

/** A validation message under a field: light-blue ink, never red. */
export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("text-meta text-sky-ink", className)} {...props} />;
}
