import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

// A link without a recipe: the sheet explains where the recipe usually is and offers Text and Foto.

const start = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-jobs-client", () => ({
  useAiJobs: () => ({
    jobs: [],
    loaded: true,
    reveals: { suggest: 0, analyze: 0, import: 0 },
    start,
    fetchResult: vi.fn(),
    reveal: () => {},
    cancel: vi.fn(),
    markSeen: vi.fn(),
    dismiss: vi.fn(),
  }),
  useShowingAiResults: () => {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../actions/find-recipe-by-source", () => ({ findRecipeBySource: vi.fn().mockResolvedValue(ok(null)) }));

const { ImportRecipeProvider, requestImportSheet } = await import("./import-sheet");

beforeEach(() => {
  start.mockReset();
  start.mockResolvedValue(fail("import_no_recipe"));
});

async function readLink(link: string) {
  requestImportSheet();
  render(<ImportRecipeProvider>Recept</ImportRecipeProvider>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Länk till receptet"), link);
  await user.click(screen.getByRole("button", { name: "Läs in recept" }));
  return user;
}

describe("a link without a recipe", () => {
  it("names the platform for a social link and switches to Text", async () => {
    const user = await readLink("https://vm.tiktok.com/ZM123/");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Det gick inte att hitta något recept på sidan.");
    expect(alert).toHaveTextContent("Receptet på TikTok står ofta i bildtexten eller i videon, inte på sidan.");
    expect(alert).toHaveTextContent("Ta en skärmbild av texten och använd Foto.");
    expect(alert).toHaveTextContent("Går texten att kopiera kan du i stället klistra in den här.");
    await user.click(screen.getByRole("button", { name: "Klistra in text i stället" }));
    expect(screen.getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches to Foto with Använd Foto", async () => {
    const user = await readLink("https://www.instagram.com/reel/abc/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Receptet på Instagram");
    await user.click(screen.getByRole("button", { name: "Använd Foto" }));
    expect(screen.getByRole("tab", { name: "Foto" })).toHaveAttribute("aria-selected", "true");
  });

  it("gives the shorter help for another site", async () => {
    await readLink("https://www.koket.se/pannkakor");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ta en skärmbild av receptet och använd Foto.");
    expect(alert).not.toHaveTextContent("videon");
    expect(screen.getByRole("button", { name: "Använd Foto" })).toBeInTheDocument();
  });
});
