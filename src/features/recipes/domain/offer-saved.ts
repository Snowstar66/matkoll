// Story 16.4: the line under the title of a recipe saved from the offers.

/** The sentence under the title of a recipe saved from the offers, or `null` for any other recipe. */
export function offerSavedText(offerNames: readonly string[] | undefined): string | null {
  const names = (offerNames ?? []).filter((name) => name.trim() !== "");
  return names.length > 0 ? `Sparad från veckans erbjudanden: ${names.join(", ")}` : null;
}
