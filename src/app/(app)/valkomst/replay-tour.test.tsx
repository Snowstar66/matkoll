import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("@/features/welcome/actions/mark-tour-seen", () => ({ markTourSeen: async () => ({ ok: true, data: null }) }));
vi.mock("@/features/recipes/ui/import-sheet", () => ({ requestImportSheet: () => {} }));
vi.mock("@/features/pantry/ui/photo-handover", () => ({ handOverPlacePhoto: () => {} }));

const { ReplayTour } = await import("./replay-tour");

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});

describe("ReplayTour", () => {
  it("goes back to Hjälp with Hoppa över when it came from there", async () => {
    render(<ReplayTour returnTo="/hjalp" />);
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    expect(replace).toHaveBeenCalledWith("/hjalp");
  });

  it("goes to Recept with Hoppa över otherwise, and the choices lead on", async () => {
    render(<ReplayTour returnTo="/recept" />);
    await userEvent.click(screen.getByRole("button", { name: "Hoppa över" }));
    expect(replace).toHaveBeenCalledWith("/recept");
  });
});
