import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { BackfillStep } from "../actions/backfill-recipe-images";
import { imageProgressText, RecipeImageBackfill } from "./recipe-image-backfill";

// "Spara receptbilder hos oss": never starts by itself, goes a few recipes at a time with the
// progress shown, skips what failed, stops at the cap, and "Avbryt" stops between two steps.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const backfillRecipeImages = vi.fn();
vi.mock("../actions/backfill-recipe-images", () => ({ backfillRecipeImages: (...args: unknown[]) => backfillRecipeImages(...args) }));

const step = (overrides: Partial<BackfillStep> = {}): BackfillStep => ({
  attempted: 3,
  stored: 3,
  failedIds: [],
  capReached: false,
  missing: 0,
  withCopy: 5,
  ...overrides,
});

beforeEach(() => {
  refresh.mockReset();
  backfillRecipeImages.mockReset();
});

describe("imageProgressText", () => {
  it("says how many recipes have their picture here", () => {
    expect(imageProgressText({ withCopy: 12, missing: 28 })).toBe("12 av 40 recept har bilden hos oss.");
    expect(imageProgressText({ withCopy: 0, missing: 0 })).toBe("Inga recept har någon bild att spara.");
  });
});

describe("RecipeImageBackfill", () => {
  it("shows the progress and a button, and starts nothing by itself", () => {
    render(<RecipeImageBackfill status={{ withCopy: 2, missing: 3 }} />);
    expect(screen.getByTestId("recipe-image-progress")).toHaveTextContent("2 av 5 recept har bilden hos oss.");
    expect(screen.getByRole("button", { name: "Spara receptbilder hos oss" })).toBeEnabled();
    expect(backfillRecipeImages).not.toHaveBeenCalled();
  });

  it("has nothing to do, and a disabled button, when every recipe has its picture", () => {
    render(<RecipeImageBackfill status={{ withCopy: 5, missing: 0 }} />);
    expect(screen.getByRole("button", { name: "Spara receptbilder hos oss" })).toBeDisabled();
  });

  it("calls the action again until a step finds nothing left, updating the progress, then refreshes", async () => {
    backfillRecipeImages
      .mockResolvedValueOnce(ok(step({ stored: 3, missing: 2, withCopy: 3 })))
      .mockResolvedValueOnce(ok(step({ attempted: 2, stored: 2, missing: 0, withCopy: 5 })))
      .mockResolvedValueOnce(ok(step({ attempted: 0, stored: 0, missing: 0, withCopy: 5 })));
    render(<RecipeImageBackfill status={{ withCopy: 0, missing: 5 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Spara receptbilder hos oss" }));
    await waitFor(() => expect(screen.getByText("Klart. Alla bilder ligger hos oss.")).toBeInTheDocument());
    expect(backfillRecipeImages).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("recipe-image-progress")).toHaveTextContent("5 av 5 recept har bilden hos oss.");
    expect(refresh).toHaveBeenCalled();
  });

  it("skips the recipes that failed in the next steps, and says how many stayed on the site", async () => {
    const failedId = "a1111111-1111-4111-8111-111111111111";
    backfillRecipeImages
      .mockResolvedValueOnce(ok(step({ attempted: 2, stored: 1, failedIds: [failedId], missing: 1, withCopy: 1 })))
      .mockResolvedValueOnce(ok(step({ attempted: 0, stored: 0, missing: 1, withCopy: 1 })));
    render(<RecipeImageBackfill status={{ withCopy: 0, missing: 2 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Spara receptbilder hos oss" }));
    await waitFor(() => expect(screen.getByText(/1 bilder gick inte att hämta/)).toBeInTheDocument());
    expect(backfillRecipeImages).toHaveBeenNthCalledWith(1, []);
    expect(backfillRecipeImages).toHaveBeenNthCalledWith(2, [failedId]);
    // Running again is possible: one recipe is still missing.
    expect(screen.getByRole("button", { name: "Spara receptbilder hos oss" })).toBeEnabled();
  });

  it("stops at the cap with a message", async () => {
    backfillRecipeImages.mockResolvedValueOnce(ok(step({ attempted: 2, stored: 1, failedIds: ["a1111111-1111-4111-8111-111111111111"], capReached: true, missing: 4, withCopy: 1 })));
    render(<RecipeImageBackfill status={{ withCopy: 0, missing: 5 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Spara receptbilder hos oss" }));
    await waitFor(() => expect(screen.getByText(/utrymme för receptbilder är fullt/)).toBeInTheDocument());
    expect(backfillRecipeImages).toHaveBeenCalledTimes(1);
  });

  it("stops after the step in progress when Avbryt is pressed, and keeps what was saved", async () => {
    let release!: (value: unknown) => void;
    backfillRecipeImages.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    render(<RecipeImageBackfill status={{ withCopy: 0, missing: 9 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Spara receptbilder hos oss" }));
    await userEvent.click(await screen.findByRole("button", { name: "Avbryt" }));
    release(ok(step({ stored: 3, missing: 6, withCopy: 3 })));
    await waitFor(() => expect(screen.getByText("Avbröt. Det som hann sparas ligger kvar.")).toBeInTheDocument());
    expect(backfillRecipeImages).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("recipe-image-progress")).toHaveTextContent("3 av 9 recept har bilden hos oss.");
    expect(screen.queryByRole("button", { name: "Avbryt" })).not.toBeInTheDocument();
  });

  it("shows the action's message when it fails, and when it does not answer", async () => {
    backfillRecipeImages.mockResolvedValueOnce(fail("recipe_images_failed"));
    render(<RecipeImageBackfill status={{ withCopy: 0, missing: 2 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Spara receptbilder hos oss" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara receptbilderna.");
    backfillRecipeImages.mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(screen.getByRole("button", { name: "Spara receptbilder hos oss" }));
    await waitFor(() => expect(backfillRecipeImages).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara receptbilderna.");
  });
});
