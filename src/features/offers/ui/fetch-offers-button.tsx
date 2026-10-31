"use client";

import type { ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";

/** A text link inside a line of meta text: accent, underlined, with a 44 px tap area around it. */
export const inlineLinkClasses =
  "relative inline font-medium text-accent underline underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-60";

export type FetchOffersButtonProps = Omit<ComponentPropsWithoutRef<"button">, "onClick" | "children" | "type"> & {
  /** Starts the fetch; the sheet sends one store's id at a time. */
  onFetch: () => void;
  /** "primary" without offers ("Hämta veckans erbjudanden"), "link" in the sheet's header line with them ("Hämta igen", Story 16.11). */
  variant: "primary" | "link";
  /** While a page is fetched: the button waits. */
  pending: boolean;
};

/**
 * "Hämta veckans erbjudanden", or the inline link "Hämta igen" once there are
 * offers (Story 9.1, 16.11), for a user with one store that has a link (Story
 * 9.13 adds "Hämta valda" and "Hämta alla" for several). It never fetches by
 * itself, and it waits while a fetch runs, so one tap is one fetch. The link
 * is small text in the line "Hämtade idag 13:30 · Hämta igen" and keeps a
 * 44 px tap area.
 */
export function FetchOffersButton({ onFetch, variant, pending, className, ...rest }: FetchOffersButtonProps) {
  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={onFetch}
        disabled={pending}
        aria-disabled={pending || undefined}
        className={cx(inlineLinkClasses, className)}
        {...rest}
      >
        Hämta igen
      </button>
    );
  }
  return (
    <Button type="button" onClick={onFetch} variant="primary" fullWidth disabled={pending} aria-disabled={pending || undefined} className={className} {...rest}>
      Hämta veckans erbjudanden
    </Button>
  );
}
