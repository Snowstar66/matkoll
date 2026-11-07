// An item that came from a weekly offer is saved with its offer in the label
// (Story 9.12): "Havregryn (Erbjudande Maxi: 89 kr/kg)". The list shows the
// name and the price as an OfferTag (UX-20) instead of the bracket. Pure.

const offerNote = /^(.*?)\s*\(Erbjudande(?:\s[^:()]+)?:\s*([^()]+)\)$/;

/** The item's name and the offer's price when the label carries an offer with a price; `null` for any other label. */
export function splitOfferNote(label: string): { name: string; price: string } | null {
  const match = offerNote.exec(label.trim());
  if (!match) return null;
  const name = match[1].trim();
  const price = match[2].trim();
  return name && price ? { name, price } : null;
}
