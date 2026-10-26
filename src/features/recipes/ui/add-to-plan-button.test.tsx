import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import { AddToPlanButton, type AddToPlan } from "./add-to-plan-button";

// "Lägg på matsedeln" in the recipe view (Story 3.1), with mealplan.addToCurrentPlan stubbed.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const recipeId = "11111111-1111-4111-8111-111111111111";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const button = (addToPlan: AddToPlan, servings: number) => (
  <ToastProvider>
    <AddToPlanButton recipeId={recipeId} addToPlan={addToPlan} servings={servings} />
  </ToastProvider>
);

function renderButton(addToPlan: AddToPlan, servings = 4) {
  return render(button(addToPlan, servings));
}

describe("AddToPlanButton", () => {
  it("adds the recipe and confirms it shortly", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish" }));
    renderButton(addToPlan);
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(addToPlan).toHaveBeenCalledWith({ recipeId, servings: 4, id: expect.stringMatching(uuid) });
    expect(screen.getByTestId("toast")).toHaveTextContent("Lagt på matsedeln.");
  });

  it("adds the chosen servings, within what a dish allows", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish" }));
    renderButton(addToPlan, 6);
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(addToPlan).toHaveBeenCalledWith({ recipeId, servings: 6, id: expect.stringMatching(uuid) });
  });

  it("adds at most 1000 servings, the most a dish has", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(ok({ id: "dish" }));
    renderButton(addToPlan, 1100);
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(addToPlan).toHaveBeenCalledWith({ recipeId, servings: 1000, id: expect.stringMatching(uuid) });
  });

  it("tries again with a new dish id when the servings changed after a failure", async () => {
    const user = userEvent.setup();
    const addToPlan = vi.fn<AddToPlan>().mockResolvedValue(fail("mealplan_add_failed"));
    const { rerender } = renderButton(addToPlan, 4);
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    rerender(button(addToPlan, 6));
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    const calls = addToPlan.mock.calls.map(([input]) => input);
    expect(calls.map((input) => input.servings)).toEqual([4, 4, 6]);
    expect(calls[1].id).toBe(calls[0].id);
    expect(calls[2].id).not.toBe(calls[1].id);
  });

  it("tries again with the same dish id after a failure, and a new one after a success", async () => {
    const user = userEvent.setup();
    const addToPlan = vi
      .fn<AddToPlan>()
      .mockResolvedValueOnce(fail("mealplan_add_failed"))
      .mockResolvedValue(ok({ id: "dish" }));
    renderButton(addToPlan);
    const button = screen.getByRole("button", { name: "Lägg på matsedeln" });
    await user.click(button);
    await user.click(button);
    await user.click(button);
    const ids = addToPlan.mock.calls.map(([input]) => input.id);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  it("says why when it cannot be added", async () => {
    const user = userEvent.setup();
    renderButton(vi.fn<AddToPlan>().mockResolvedValue(fail("mealplan_add_failed")));
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(screen.getByTestId("toast")).toHaveTextContent("Det gick inte att lägga rätten på matsedeln.");
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att lägga rätten på matsedeln.");
  });

  it("refreshes the page for an expired session", async () => {
    const user = userEvent.setup();
    renderButton(vi.fn<AddToPlan>().mockResolvedValue(fail("unauthorized")));
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(refresh).toHaveBeenCalled();
  });
});
