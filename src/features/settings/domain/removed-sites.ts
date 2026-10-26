/**
 * The short confirmation after "Ta bort", for every site removed while the
 * same confirmation has shown: "Tog bort koket.se.", "Tog bort koket.se och
 * ica.se." or "Tog bort 3 sajter.".
 */
export function removedSitesMessage(domains: readonly string[]): string {
  if (domains.length === 1) return `Tog bort ${domains[0]}.`;
  if (domains.length === 2) return `Tog bort ${domains[0]} och ${domains[1]}.`;
  return `Tog bort ${domains.length} sajter.`;
}
