import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { AddRecipeSiteState } from "../actions/add-recipe-site";
import type { RecipeSiteChange, RecipeSiteChangeResult } from "../actions/set-recipe-site-active";
import { RecipeSites } from "./recipe-sites";

// RecipeSites with both Server Actions stubbed. The "server" list does not
// change, so what the list shows after a change comes from the optimistic
// state and goes back when the transition ends.

const setRecipeSiteActive = vi.fn<(change: RecipeSiteChange) => Promise<Result<RecipeSiteChangeResult>>>();
vi.mock("../actions/set-recipe-site-active", () => ({
  setRecipeSiteActive: (change: RecipeSiteChange) => setRecipeSiteActive(change),
}));
const addRecipeSite = vi.fn<(previous: AddRecipeSiteState, formData: FormData) => Promise<AddRecipeSiteState>>();
vi.mock("../actions/add-recipe-site", () => ({
  addRecipeSite: (previous: AddRecipeSiteState, formData: FormData) => addRecipeSite(previous, formData),
}));

const sites = ["arla.se", "koket.se", "tasteline.com"];

function renderSites() {
  return render(
    <ToastProvider>
      <RecipeSites sites={sites} />
    </ToastProvider>,
  );
}

const shownSites = () => screen.queryAllByTestId("recipe-site").map((row) => within(row).getByText(/\./).textContent);

beforeEach(() => {
  setRecipeSiteActive.mockReset();
  addRecipeSite.mockReset();
});

describe("RecipeSites", () => {
  it("lists the sites with Ta bort each", () => {
    renderSites();
    expect(shownSites()).toEqual(sites);
    expect(screen.getByRole("button", { name: "Ta bort koket.se" })).toBeEnabled();
  });

  it.each([
    ["an error result", () => Promise.resolve(fail("settings_save_failed"))],
    ["no answer", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("brings the row back after %s, with the notice and no confirmation", async (_, answer) => {
    setRecipeSiteActive.mockImplementation(answer);
    renderSites();
    await userEvent.click(screen.getByRole("button", { name: "Ta bort koket.se" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara ändringen. Försök igen.");
    await waitFor(() => expect(shownSites()).toEqual(sites));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("shows no confirmation when the site was off already", async () => {
    setRecipeSiteActive.mockResolvedValue(ok({ domain: "koket.se", isActive: false, changed: false }));
    renderSites();
    await userEvent.click(screen.getByRole("button", { name: "Ta bort koket.se" }));
    await waitFor(() => expect(setRecipeSiteActive).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(shownSites()).toEqual(sites));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("gathers removals under one confirmation, and Ångra turns them all on again", async () => {
    setRecipeSiteActive.mockImplementation(async (change) => ok({ ...change, changed: true }));
    renderSites();
    await userEvent.click(screen.getByRole("button", { name: "Ta bort koket.se" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Tog bort koket.se.");
    await userEvent.click(screen.getByRole("button", { name: "Ta bort arla.se" }));
    await waitFor(() => expect(screen.getByTestId("toast")).toHaveTextContent("Tog bort koket.se och arla.se."));

    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() =>
      expect(setRecipeSiteActive.mock.calls.map(([change]) => change)).toEqual([
        { domain: "koket.se", isActive: false },
        { domain: "arla.se", isActive: false },
        { domain: "koket.se", isActive: true },
        { domain: "arla.se", isActive: true },
      ]),
    );
  });

  it("keeps the typed text when adding gets no answer", async () => {
    addRecipeSite.mockRejectedValue(new TypeError("Failed to fetch"));
    renderSites();
    await userEvent.type(screen.getByLabelText("Ny receptsajt"), "ica.se");
    await userEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara ändringen. Försök igen.");
    expect(screen.getByLabelText("Ny receptsajt")).toHaveValue("ica.se");
  });
});
