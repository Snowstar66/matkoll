"use client";

import { Button } from "@/components/button";

export type FetchOffersButtonProps = {
  /** Starts the fetch; the sheet sends one store's id at a time. */
  onFetch: () => void;
  /** "primary" without offers ("Hämta veckans erbjudanden"), "text" with them ("Hämta igen"). */
  variant: "primary" | "text";
  /** While a page is fetched: the button waits. */
  pending: boolean;
};

/**
 * "Hämta veckans erbjudanden", or "Hämta igen" once there are offers (Story
 * 9.1), for a user with one store that has a link (Story 9.13 adds "Hämta
 * valda" and "Hämta alla" for several). It never fetches by itself, and it
 * waits while a fetch runs, so one tap is one fetch.
 */
export function FetchOffersButton({ onFetch, variant, pending }: FetchOffersButtonProps) {
  return (
    <Button
      type="button"
      onClick={onFetch}
      variant={variant}
      fullWidth={variant === "primary"}
      disabled={pending}
      aria-disabled={pending || undefined}
      className={variant === "text" ? "-mr-3 shrink-0" : undefined}
    >
      {variant === "primary" ? "Hämta veckans erbjudanden" : "Hämta igen"}
    </Button>
  );
}
