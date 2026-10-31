import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { PlanDetail, PlanSummary } from "../domain/meal-plan";
import { PreviousPlan } from "./previous-plan";
import { PreviousPlans } from "./previous-plans";

// Tidigare matsedlar (Story 3.2) with the actions and the router stubbed.

const deletePlan = vi.fn<(id: string) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/copy-plan", () => ({ copyPlan: vi.fn() }));
vi.mock("../actions/delete-plan", () => ({ deletePlan: (id: string) => deletePlan(id) }));
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const planId = "33333333-3333-4333-8333-333333333333";
const summaries: PlanSummary[] = [
  { id: planId, name: "Vecka 44", createdAt: "2026-10-26T10:00:00Z", dishCount: 3, weekStart: "2026-10-26" },
  { id: "55555555-5555-4555-8555-555555555555", name: "Vecka 44", createdAt: "2025-10-27T10:00:00Z", dishCount: 1, weekStart: null },
];
const plan: PlanDetail = {
  id: planId,
  name: "Vecka 42",
  isCurrent: false,
  weekStart: "2026-10-12",
  createdAt: "2026-10-12T08:00:00Z",
  recipes: [
    { id: "d1", recipeId: "11111111-1111-4111-8111-111111111111", recipeTitle: "Pasta", servings: 4, position: 0 },
    { id: "d2", recipeId: null, recipeTitle: "Linssoppa", servings: 1, position: 1 },
  ],
};

beforeEach(() => {
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
      "Vecka 441 rätt · undanlagd · skapad 27 okt 2025",
    ]);
    expect(within(rows[0]).getByRole("link", { name: "Vecka 44" })).toHaveAttribute(
      "href",
      `/matsedel/tidigare/${planId}`,
    );
  });

  it("has no Ny matsedel button, and says undanlagd only for a plan without a week", () => {
    render(
      <ToastProvider>
        <PreviousPlans plans={summaries} />
      </ToastProvider>,
    );
    expect(screen.queryByRole("button", { name: "Ny matsedel" })).not.toBeInTheDocument();
    const rows = screen.getAllByTestId("previous-plan");
    expect(rows[0]).not.toHaveTextContent("undanlagd");
    expect(rows[1]).toHaveTextContent("undanlagd · skapad 27 okt 2025");
  });

  it("says so when there are none", () => {
    render(
      <ToastProvider>
        <PreviousPlans plans={[]} />
      </ToastProvider>,
    );
    expect(screen.getByText("Inga tidigare matsedlar än.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ny matsedel" })).not.toBeInTheDocument();
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
    expect(screen.getByTestId("copy-note")).toHaveTextContent("1 rätt med borttaget recept följer inte med.");
    expect(screen.getByRole("button", { name: /Kopiera till/ })).toHaveAccessibleDescription(
      "1 rätt med borttaget recept följer inte med.",
    );
  });

  it("offers no Kopiera till when every recipe is deleted, and says why", () => {
    const gone = { ...plan, recipes: plan.recipes.map((dish) => ({ ...dish, recipeId: null })) };
    render(
      <ToastProvider>
        <PreviousPlan plan={gone} />
      </ToastProvider>,
    );
    const button = screen.getByRole("button", { name: /Kopiera till/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Alla recept på matsedeln är borttagna, så den går inte att kopiera.");
  });

  it("offers no Kopiera till for a plan without dishes", () => {
    render(
      <ToastProvider>
        <PreviousPlan plan={{ ...plan, recipes: [] }} />
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: /Kopiera till/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Kopiera till/ })).toHaveAccessibleDescription("Matsedeln har inga rätter.");
  });

  it("has no Använd igen button, and shows Kopiera till and Ta bort matsedel", () => {
    renderPlan();
    expect(screen.queryByRole("button", { name: "Använd igen" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kopiera till/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ta bort matsedel" })).toBeEnabled();
  });

  it("says undanlagd for a plan without a week", () => {
    render(
      <ToastProvider>
        <PreviousPlan plan={{ ...plan, weekStart: null }} />
      </ToastProvider>,
    );
    expect(screen.getByText("2 rätter · undanlagd · skapad 12 okt 2026")).toBeInTheDocument();
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
