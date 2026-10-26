import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { PlanDetail, PlanSummary } from "../domain/meal-plan";
import { PreviousPlan } from "./previous-plan";
import { PreviousPlans } from "./previous-plans";

// Tidigare matsedlar (Story 3.2) with the actions and the router stubbed.

const newPlan = vi.fn<(id?: string) => Promise<Result<{ id: string }>>>();
const reusePlan = vi.fn<(id: string, newPlanId?: string) => Promise<Result<{ id: string }>>>();
const deletePlan = vi.fn<(id: string) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/new-plan", () => ({ newPlan: (id?: string) => newPlan(id) }));
vi.mock("../actions/reuse-plan", () => ({
  reusePlan: (id: string, newPlanId?: string) => reusePlan(id, newPlanId),
}));
vi.mock("../actions/delete-plan", () => ({ deletePlan: (id: string) => deletePlan(id) }));
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const planId = "33333333-3333-4333-8333-333333333333";
const summaries: PlanSummary[] = [
  { id: planId, name: "Vecka 44", createdAt: "2026-10-26T10:00:00Z", dishCount: 3 },
  { id: "55555555-5555-4555-8555-555555555555", name: "Vecka 44", createdAt: "2025-10-27T10:00:00Z", dishCount: 1 },
];
const plan: PlanDetail = {
  id: planId,
  name: "Vecka 42",
  isCurrent: false,
  createdAt: "2026-10-12T08:00:00Z",
  recipes: [
    { id: "d1", recipeId: "11111111-1111-4111-8111-111111111111", recipeTitle: "Pasta", servings: 4, position: 0 },
    { id: "d2", recipeId: null, recipeTitle: "Linssoppa", servings: 1, position: 1 },
  ],
};

beforeEach(() => {
  newPlan.mockReset().mockImplementation(async (id) => ok({ id: id ?? "" }));
  reusePlan.mockReset().mockImplementation(async (_id, newPlanId) => ok({ id: newPlanId ?? "" }));
  deletePlan.mockReset().mockResolvedValue(ok({ id: planId }));
  router.push.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
});

describe("PreviousPlans", () => {
  it("lists the earlier plans with their dishes and creation date, each a link to the plan", () => {
    render(
      <ToastProvider>
        <PreviousPlans plans={summaries} />
      </ToastProvider>,
    );
    const rows = screen.getAllByTestId("previous-plan");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Vecka 443 rätter · skapad 26 okt 2026",
      "Vecka 441 rätt · skapad 27 okt 2025",
    ]);
    expect(within(rows[0]).getByRole("link", { name: "Vecka 44" })).toHaveAttribute(
      "href",
      `/matsedel/tidigare/${planId}`,
    );
  });

  it("says so when there are none", () => {
    render(
      <ToastProvider>
        <PreviousPlans plans={[]} />
      </ToastProvider>,
    );
    expect(screen.getByText("Inga tidigare matsedlar än.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ny matsedel" })).toBeEnabled();
  });

  it("Ny matsedel makes a new plan and lands on Matsedel with the confirmation", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <PreviousPlans plans={summaries} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Ny matsedel" }));
    expect(newPlan).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(router.push).toHaveBeenCalledWith("/matsedel");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Matsedeln är skapad.");
  });

  it("says when the plan cannot be made, and a retry uses the same id", async () => {
    const user = userEvent.setup();
    newPlan.mockResolvedValueOnce(fail("mealplan_create_failed")).mockRejectedValueOnce(new Error("offline"));
    render(
      <ToastProvider>
        <PreviousPlans plans={summaries} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Ny matsedel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att skapa matsedeln. Försök igen.");
    // The button reads "Skapar …" until each failed try has settled.
    await user.click(await screen.findByRole("button", { name: "Ny matsedel" }));
    await user.click(await screen.findByRole("button", { name: "Ny matsedel" }));
    expect(newPlan).toHaveBeenCalledTimes(3);
    const ids = newPlan.mock.calls.map(([id]) => id);
    expect(new Set(ids).size).toBe(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("refreshes instead of showing an error when the session is gone", async () => {
    const user = userEvent.setup();
    newPlan.mockResolvedValue(fail("unauthorized"));
    render(
      <ToastProvider>
        <PreviousPlans plans={summaries} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Ny matsedel" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("drops the id and reads the page again when the plans changed elsewhere", async () => {
    const user = userEvent.setup();
    newPlan.mockResolvedValueOnce(fail("mealplan_plans_changed"));
    render(
      <ToastProvider>
        <PreviousPlans plans={summaries} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Ny matsedel" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Matsedlarna har ändrats.");
    // The button reads "Skapar …" until the failed try has settled.
    await user.click(await screen.findByRole("button", { name: "Ny matsedel" }));
    const [[first], [second]] = newPlan.mock.calls;
    expect(second).not.toBe(first);
    expect(router.push).toHaveBeenCalledWith("/matsedel");
  });

  it("sends one request for a double click", async () => {
    let answer: (result: Result<{ id: string }>) => void = () => {};
    newPlan.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    render(
      <ToastProvider>
        <PreviousPlans plans={summaries} />
      </ToastProvider>,
    );
    const button = screen.getByRole("button", { name: "Ny matsedel" });
    act(() => {
      button.click();
      button.click();
    });
    expect(newPlan).toHaveBeenCalledTimes(1);
    await act(async () => answer(ok({ id: "x" })));
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

describe("PreviousPlan", () => {
  function renderPlan() {
    return render(
      <ToastProvider>
        <PreviousPlan plan={plan} />
      </ToastProvider>,
    );
  }

  it("shows the dishes with their servings, and a deleted recipe as Borttaget recept", () => {
    renderPlan();
    const dishes = screen.getAllByTestId("previous-dish");
    expect(dishes.map((dish) => dish.textContent)).toEqual(["Pasta4 portioner", "Borttaget recept: Linssoppa1 portion"]);
    expect(within(dishes[0]).getByRole("link", { name: "Pasta" })).toHaveAttribute("href", `/recept/${plan.recipes[0].recipeId}`);
    expect(within(dishes[1]).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("2 rätter · skapad 12 okt 2026")).toBeInTheDocument();
  });

  it("says that the dish with a deleted recipe does not come along", () => {
    renderPlan();
    expect(screen.getByTestId("reuse-note")).toHaveTextContent("1 rätt med borttaget recept följer inte med.");
    expect(screen.getByRole("button", { name: "Använd igen" })).toHaveAccessibleDescription(
      "1 rätt med borttaget recept följer inte med.",
    );
  });

  it("offers no Använd igen when every recipe is deleted, and says why", () => {
    const gone = { ...plan, recipes: plan.recipes.map((dish) => ({ ...dish, recipeId: null })) };
    render(
      <ToastProvider>
        <PreviousPlan plan={gone} />
      </ToastProvider>,
    );
    const button = screen.getByRole("button", { name: "Använd igen" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Alla recept på matsedeln är borttagna, så den går inte att använda igen.");
  });

  it("offers no Använd igen for a plan without dishes", () => {
    render(
      <ToastProvider>
        <PreviousPlan plan={{ ...plan, recipes: [] }} />
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: "Använd igen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Använd igen" })).toHaveAccessibleDescription("Matsedeln har inga rätter.");
  });

  it("goes back to Tidigare when the plan to use again is gone", async () => {
    const user = userEvent.setup();
    reusePlan.mockResolvedValue(fail("mealplan_plan_gone"));
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Använd igen" }));
    expect(router.replace).toHaveBeenCalledWith("/matsedel/tidigare");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Matsedeln finns inte längre.");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Använd igen makes a new current plan of it and lands on Matsedel", async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Använd igen" }));
    expect(reusePlan).toHaveBeenCalledWith(planId, expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(router.push).toHaveBeenCalledWith("/matsedel");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Matsedeln är skapad.");
  });

  it("Ta bort matsedel asks first, and Avbryt leaves the plan", async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Ta bort matsedel" }));
    const sheet = screen.getByRole("dialog", { name: "Ta bort matsedel" });
    expect(sheet).toHaveTextContent("Ta bort Vecka 42? Det går inte att ångra.");
    expect(within(sheet).getByRole("button", { name: "Avbryt" })).toHaveFocus();
    await user.click(within(sheet).getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deletePlan).not.toHaveBeenCalled();
  });

  it("deletes the plan after the question and goes back to Tidigare", async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Ta bort matsedel" }));
    const sheet = screen.getByRole("dialog", { name: "Ta bort matsedel" });
    await user.click(within(sheet).getByRole("button", { name: "Ta bort" }));
    expect(deletePlan).toHaveBeenCalledWith(planId);
    expect(router.replace).toHaveBeenCalledWith("/matsedel/tidigare");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Matsedeln är borttagen.");
  });

  it("keeps the question open with a notice when the delete fails", async () => {
    const user = userEvent.setup();
    deletePlan.mockResolvedValue(fail("mealplan_delete_failed"));
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Ta bort matsedel" }));
    const sheet = screen.getByRole("dialog", { name: "Ta bort matsedel" });
    await user.click(within(sheet).getByRole("button", { name: "Ta bort" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Det gick inte att ta bort matsedeln. Försök igen.");
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Ta bort matsedel" })).toBeInTheDocument();
  });

  it("reads the page again when the session is gone, and says so when the delete throws", async () => {
    const user = userEvent.setup();
    deletePlan.mockResolvedValueOnce(fail("unauthorized")).mockRejectedValueOnce(new Error("offline"));
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Ta bort matsedel" }));
    const sheet = screen.getByRole("dialog", { name: "Ta bort matsedel" });
    await user.click(within(sheet).getByRole("button", { name: "Ta bort" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    // The button reads "Tar bort …" until the first delete has settled.
    await user.click(await within(sheet).findByRole("button", { name: "Ta bort" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Det gick inte att ta bort matsedeln. Försök igen.");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends one delete for a double click", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<{ id: string }>) => void = () => {};
    deletePlan.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Ta bort matsedel" }));
    const button = within(screen.getByRole("dialog", { name: "Ta bort matsedel" })).getByRole("button", { name: "Ta bort" });
    act(() => {
      button.click();
      button.click();
    });
    expect(deletePlan).toHaveBeenCalledTimes(1);
    await act(async () => answer(ok({ id: planId })));
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});
