import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "text";

const base =
  "inline-flex items-center justify-center gap-2 text-row-title select-none disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  // At most one primary button per view (DESIGN.md).
  primary: "h-button rounded-md bg-accent px-5 text-on-accent",
  secondary: "h-button rounded-md bg-sky px-5 text-sky-ink",
  // Text buttons keep a 44 px tap area.
  text: "min-h-tap min-w-tap rounded-md px-3 text-accent",
};

/**
 * Classes for a button look on another element, e.g. a `<Link>`.
 * `fullWidth` stretches it across its container.
 */
export function buttonClasses(variant: ButtonVariant = "primary", fullWidth = false): string {
  return cx(base, variants[variant], fullWidth && "w-full");
}

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

/** Primary (accent), secondary (light blue) or text button. Labels are verbs: "Spara recept". */
export function Button({ variant = "primary", fullWidth = false, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(buttonClasses(variant, fullWidth), className)} {...props} />;
}
