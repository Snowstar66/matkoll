import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { saveOption } from "@/lib/options";
import { StarterEmptyOffer, StarterMoreRow, type StarterOffer } from "./starter-offer";

const empty = <p>Inga recept än.</p>;
const importButton = <button type="button">Importera ett eget recept</button>;

async function show(offer: StarterOffer | undefined, element: (promise: Promise<StarterOffer | undefined>) => React.ReactElement) {
  const promise = Promise.resolve(offer);
  await act(async () => {
    render(element(promise));
    await promise;
  });
}

beforeEach(() => localStorage.clear());

describe("Startrecept on Recept", () => {
  it("shows nothing new with Tillval Startrecept off (the default)", async () => {
    await show({ available: 20, total: 20 }, (offer) => (
      <>
        <StarterEmptyOffer offer={offer} importButton={importButton}>
          {empty}
        </StarterEmptyOffer>
        <StarterMoreRow offer={offer} />
      </>
    ));
    expect(screen.getByText("Inga recept än.")).toBeTruthy();
    expect(screen.queryByTestId("starter-offer")).toBeNull();
    expect(screen.queryByTestId("starter-more")).toBeNull();
  });

  it("puts the offer in the empty list with the switch on, and the import as a text link under it", async () => {
    saveOption("starterRecipes", true);
    await show({ available: 20, total: 20 }, (offer) => (
      <StarterEmptyOffer offer={offer} importButton={importButton}>
        {empty}
      </StarterEmptyOffer>
    ));
    expect(screen.getByRole("heading", { name: "Börja med några recept" })).toBeTruthy();
    expect(screen.getByText(/Välj bland 20 vardagsrätter, med bild/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Välj startrecept" }).getAttribute("href")).toBe("/recept/startrecept");
    expect(screen.getByRole("button", { name: "Importera ett eget recept" })).toBeTruthy();
    expect(screen.queryByText("Inga recept än.")).toBeNull();
  });

  it("keeps the usual empty state when everything is added, or the pack cannot be read", async () => {
    saveOption("starterRecipes", true);
    await show({ available: 0, total: 20 }, (offer) => (
      <StarterEmptyOffer offer={offer} importButton={importButton}>
        {empty}
      </StarterEmptyOffer>
    ));
    expect(screen.getByText("Inga recept än.")).toBeTruthy();
  });

  it("ends a list with Fler recept? while there is something left to choose", async () => {
    saveOption("starterRecipes", true);
    await show({ available: 3, total: 20 }, (offer) => <StarterMoreRow offer={offer} />);
    expect(screen.getByTestId("starter-more").getAttribute("href")).toBe("/recept/startrecept");
    expect(screen.getByText("Välj bland startrecepten")).toBeTruthy();
  });
});
