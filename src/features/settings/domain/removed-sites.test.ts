import { describe, expect, it } from "vitest";
import { removedSitesMessage } from "./removed-sites";

describe("removedSitesMessage", () => {
  it.each([
    [["koket.se"], "Tog bort koket.se."],
    [["koket.se", "ica.se"], "Tog bort koket.se och ica.se."],
    [["koket.se", "ica.se", "arla.se"], "Tog bort 3 sajter."],
  ])("%j → %s", (domains, message) => {
    expect(removedSitesMessage(domains)).toBe(message);
  });
});
