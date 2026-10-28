"use client";

import { Button } from "@/components/button";

export type FetchOffersButtonProps = {
  /** The form the button submits (the sheet's fetch form). */
  form: string;
  /** "primary" without offers ("Hämta veckans erbjudanden"), "text" with them ("Hämta igen"). */
  variant: "primary" | "text";
  /** While the page is fetched: the button waits. */
  pending: boolean;
};

/**
 * "Hämta veckans erbjudanden", or "Hämta igen" once there are offers (Story
 * 9.1). It only submits the sheet's form, which sends the store's id; it
 * never fetches by itself, and it waits while a fetch runs, so one tap is
 * one fetch.
 */
export function FetchOffersButton({ form, variant, pending }: FetchOffersButtonProps) {
  return (
    <Button
      type="submit"
      form={form}
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
