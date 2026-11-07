import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";

// Story 20.1: "Lägg till ett recept" in the welcome tour opens Importera recept on Recept.

const find = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-jobs-client", async () => (await import("../../../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions/find-recipe-by-source", () => ({ findRecipeBySource: find }));

const { ImportRecipeProvider, requestImportSheet } = await import("./import-sheet");

beforeEach(() => {
  fakeAi.reset();
  find.mockReset();
});

const sheet = () => screen.queryByRole("dialog", { name: "Importera recept" });

describe("requestImportSheet", () => {
  it("opens the sheet on the Recept that shows, once per request", async () => {
    const { unmount } = render(<ImportRecipeProvider>Recept</ImportRecipeProvider>);
    expect(sheet()).toBeNull();
    act(() => requestImportSheet());
    expect(sheet()).toBeInTheDocument();
    unmount();
    // A request already handled does not open the sheet again on the next Recept.
    render(<ImportRecipeProvider>Recept</ImportRecipeProvider>);
    expect(sheet()).toBeNull();
  });

  it("opens the sheet on a Recept that shows after the request", () => {
    requestImportSheet();
    render(<ImportRecipeProvider>Recept</ImportRecipeProvider>);
    expect(sheet()).toBeInTheDocument();
  });
});

describe("a link that is already in Recept (UX-23)", () => {
  it("says it exists and offers Öppna receptet and Spara en kopia instead of reading it again", async () => {
    find.mockResolvedValue(ok({ id: "r1", title: "Bakad fetaost" }));
    requestImportSheet();
    render(<ImportRecipeProvider>Recept</ImportRecipeProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Länk till receptet"), "https://www.tasteline.com/recept/bakad-fetaost");
    await user.click(screen.getByRole("button", { name: "Läs in recept" }));
    expect(await screen.findByText("Bakad fetaost finns redan.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Öppna receptet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spara en kopia" })).toBeInTheDocument();
    expect(find).toHaveBeenCalledWith("https://www.tasteline.com/recept/bakad-fetaost");
  });
});
