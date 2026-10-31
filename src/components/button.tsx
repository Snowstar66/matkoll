import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "text" | "compact" | "compact-primary" | "danger" | "quiet";

const base =
  "inline-flex items-center justify-center gap-2 select-none disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  // At most one primary button per view (DESIGN.md).
  primary: "h-button text-row-title rounded-md bg-accent px-5 text-on-accent",
  secondary: "h-button text-row-title rounded-md bg-sky px-5 text-sky-ink",
  // Text buttons keep a 44 px tap area.
  // Small text button with a 44 px tap area (Story 16.9).
  compact: "min-h-tap min-w-tap rounded-md px-2 text-meta font-semibold text-accent",
  // A slim primary button: 40 px visible, 44 px tap area.
  "compact-primary":
    "relative h-10 rounded-md bg-accent px-4 text-meta font-semibold text-on-accent before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']",
  // Story 16.17: a text button in muted red, only for Ta bort (DESIGN.md), and a grey one for Avvisa.
  danger: "min-h-12 min-w-tap text-row-title rounded-md px-3 text-danger",
  quiet: "min-h-12 min-w-tap text-row-title rounded-md px-3 text-ink-2",
  text: "min-h-tap min-w-tap text-row-title rounded-md px-3 text-accent",
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
