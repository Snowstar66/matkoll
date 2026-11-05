import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { AiJob } from "@/lib/ai-job-shape";
import { fail, ok } from "@/lib/errors";
import { resetRecipeFilterStore, recipeFilterStorageKey } from "@/features/recipes/ui/recipe-filter-store";
import { FindDishesButton, findDishesStartedText } from "./find-dishes-button";

// "Vad kan jag laga?" on Hemma, with the job start and the router stubbed.

const startJob = vi.fn<(url: string, body: Record<string, unknown>, key: string) => Promise<unknown>>();
const push = vi.fn();
let jobs: Partial<AiJob>[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/ai-jobs-client", () => ({
  useAiJobs: () => ({ jobs, start: (url: string, body: Record<string, unknown>, key: string) => startJob(url, body, key) }),
}));

const show = () =>
  render(
    <ToastProvider>
      <FindDishesButton />
    </ToastProvider>,
  );

beforeEach(() => {
  jobs = [];
  push.mockReset();
  window.localStorage.clear();
  resetRecipeFilterStore();
  startJob.mockReset().mockResolvedValue(ok({ job: { id: "job" } }));
});

describe("FindDishesButton", () => {
  it("starts the suggestion job, says so and opens Recept on Kan lagas nu", async () => {
    show();
    await userEvent.setup().click(screen.getByRole("button", { name: "Vad kan jag laga?" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recept"));
    expect(startJob).toHaveBeenCalledTimes(1);
    const [path, body, key] = startJob.mock.calls[0];
    expect(path).toBe("/api/ai/jobs");
    expect(body).toEqual({ kind: "suggest", avoidTitles: [] });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect((await screen.findAllByText(findDishesStartedText)).length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(recipeFilterStorageKey)).toBe("cookable");
  });

  it("only navigates when a suggestion job is already running", async () => {
    jobs = [{ id: "a", kind: "suggest", status: "running" }];
    show();
    await userEvent.setup().click(screen.getByRole("button", { name: "Vad kan jag laga?" }));
    expect(push).toHaveBeenCalledWith("/recept");
    expect(startJob).not.toHaveBeenCalled();
  });

  it("says why and stays when the job cannot start", async () => {
    startJob.mockResolvedValue(fail("suggest_empty_pantry"));
    show();
    await userEvent.setup().click(screen.getByRole("button", { name: "Vad kan jag laga?" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});
