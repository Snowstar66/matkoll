import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAi } from "../../../../tests/mocks/fake-ai-jobs";

// Story 20.1: "Lägg till ett recept" in the welcome tour opens Importera recept on Recept.

vi.mock("@/lib/ai-jobs-client", async () => (await import("../../../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

const { ImportRecipeProvider, requestImportSheet } = await import("./import-sheet");

beforeEach(() => {
  fakeAi.reset();
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
