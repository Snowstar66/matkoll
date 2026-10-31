import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { getPlan, listPreviousPlans, MealPlanDataError } from "@/features/mealplan/server";
import { PreviousPlanContent } from "./[id]/previous-plan-content";
import { PreviousPlansContent } from "./previous-plans-content";

// Tidigare's content components with the reads stubbed: a read that fails
// shows a notice, an unknown plan is "Sidan finns inte." and the current
// plan leads to Matsedel.

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/mealplan/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mealplan/server")>()),
  listPreviousPlans: vi.fn(),
  getPlan: vi.fn(),
  getWeekCounts: vi.fn(async () => ({})),
}));
vi.mock("@/features/mealplan/actions/new-plan", () => ({ newPlan: vi.fn() }));
vi.mock("@/features/mealplan/actions/reuse-plan", () => ({ reusePlan: vi.fn() }));
vi.mock("@/features/mealplan/actions/delete-plan", () => ({ deletePlan: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

const planId = "33333333-3333-4333-8333-333333333333";
const plan = { id: planId, name: "Vecka 42", isCurrent: false, createdAt: "2026-10-12T08:00:00Z", recipes: [] };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  logged.mockRestore();
});

describe("PreviousPlansContent", () => {
  it("shows mealplan_previous_unavailable when the plans cannot be read", async () => {
    vi.mocked(listPreviousPlans).mockRejectedValue(new MealPlanDataError("query_failed 08006"));
    render(<ToastProvider>{await PreviousPlansContent()}</ToastProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa tidigare matsedlar. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_previous_unavailable", { reason: "query_failed 08006" });
  });

  it("throws other errors, which are bugs", async () => {
    vi.mocked(listPreviousPlans).mockRejectedValue(new TypeError("boom"));
    await expect(PreviousPlansContent()).rejects.toThrow("boom");
  });
});

describe("PreviousPlanContent", () => {
  it("shows mealplan_unavailable with the way back when the plan cannot be read", async () => {
    vi.mocked(getPlan).mockRejectedValue(new MealPlanDataError("query_failed 08006"));
    render(<ToastProvider>{await PreviousPlanContent({ id: planId })}</ToastProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa matsedeln. Försök igen.");
    expect(screen.getByRole("link", { name: "Tillbaka" })).toHaveAttribute("href", "/matsedel/tidigare");
    expect(logged).toHaveBeenCalledWith("mealplan_unavailable", { reason: "query_failed 08006" });
  });

  it("shows the plan under its name", async () => {
    vi.mocked(getPlan).mockResolvedValue(plan);
    render(<ToastProvider>{await PreviousPlanContent({ id: planId })}</ToastProvider>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Vecka 42");
  });

  it("is not found for a plan the user does not have, and leads to Matsedel for the current one", async () => {
    vi.mocked(getPlan).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...plan, isCurrent: true });
    await expect(PreviousPlanContent({ id: planId })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PreviousPlanContent({ id: planId })).rejects.toThrow("NEXT_REDIRECT /matsedel");
  });
});
