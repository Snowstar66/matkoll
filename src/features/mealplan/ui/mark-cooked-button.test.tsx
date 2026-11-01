import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { toSnapshot } from "@/features/pantry";
import { ok } from "@/lib/errors";
import type { CookedLine } from "../domain/cooked";
import { deductCaption, MarkCookedButton } from "./mark-cooked-button";

const markDishCooked = vi.fn();
vi.mock("../actions/mark-dish-cooked", () => ({ markDishCooked: (input: unknown) => markDishCooked(input) }));
vi.mock("../actions/undo-dish-cooked", () => ({ undoDishCooked: vi.fn() }));

const cream: CookedLine = { id: "1", ingredientId: "cream", amount: 2, unit: "dl", isVague: false, originalText: "2 dl grädde" };

function renderButton(snapshot = toSnapshot([{ ingredientId: "cream", amount: 5, unit: "dl" }])) {
  return render(
    <ToastProvider>
      <MarkCookedButton
        dish={{ id: "dish-1", title: "Gryta", servings: 4 }}
        originalServings={4}
        lines={[cream]}
        snapshot={snapshot}
        siteId={null}
        names={{ cream: "Grädde" }}
        variant="primary"
      />
    </ToastProvider>,
  );
}

describe("Markera som lagad's sheet (Pontus 1 Nov)", () => {
  beforeEach(() => markDishCooked.mockReset().mockResolvedValue(ok({ cookedAt: "2026-11-01T12:00:00Z", rows: [] })));

  it("has the short label, with the line about Matvaror above it while something is ticked", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Markera som lagad" }));
    const sheet = await screen.findByRole("dialog", { name: "Markera som lagad" });
    const confirm = within(sheet).getByRole("button", { name: "Markera som lagad" });
    expect(within(sheet).getByTestId("cooked-caption")).toHaveTextContent(deductCaption);
    expect(confirm).toHaveAccessibleDescription(deductCaption);
    expect(within(sheet).queryByText(/Dra från matvarorna/)).toBeNull();

    // Nothing ticked: nothing is deducted, so the line goes.
    await user.click(within(sheet).getByRole("checkbox", { name: "Grädde" }));
    expect(within(sheet).queryByTestId("cooked-caption")).toBeNull();
    expect(confirm).not.toHaveAccessibleDescription();
    await user.click(confirm);
    expect(markDishCooked).toHaveBeenCalledWith(expect.objectContaining({ dishId: "dish-1", deductions: [] }));
  });

  it("has no line about Matvaror when nothing can be deducted", async () => {
    const user = userEvent.setup();
    renderButton(toSnapshot([]));
    await user.click(screen.getByRole("button", { name: "Markera som lagad" }));
    const sheet = await screen.findByRole("dialog", { name: "Markera som lagad" });
    expect(within(sheet).queryByTestId("cooked-caption")).toBeNull();
    await user.click(within(sheet).getByRole("button", { name: "Markera som lagad" }));
    expect(markDishCooked).toHaveBeenCalledWith(expect.objectContaining({ deductions: [] }));
  });
});
