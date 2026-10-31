import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import { EatFirstRow, eatFirstStartedText } from "./eat-first-row";

// "Ät det här först" (Story 16.13): the row in Matvaror, with the job start stubbed.

const startJob = vi.fn<(url: string, body: Record<string, unknown>, key: string) => Promise<unknown>>();
vi.mock("@/lib/ai-jobs-client", () => ({
  useAiJobs: () => ({ start: (url: string, body: Record<string, unknown>, key: string) => startJob(url, body, key) }),
}));

const show = (count: number) =>
  render(
    <ToastProvider>
      <EatFirstRow count={count} />
    </ToastProvider>,
  );

beforeEach(() => startJob.mockReset().mockResolvedValue(ok({ job: { id: "job" } })));

describe("EatFirstRow", () => {
  it("is not there when nothing is old", () => {
    show(0);
    expect(screen.queryByTestId("eat-first-row")).toBeNull();
  });

  it("says how many have lain long, and asks for dishes with eatFirst, never sending the items", async () => {
    show(3);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /3 varor har legat länge – föreslå rätter med dem/ }));
    await waitFor(() => expect(startJob).toHaveBeenCalledTimes(1));
    const [path, body, key] = startJob.mock.calls[0];
    expect(path).toBe("/api/ai/jobs");
    expect(body).toEqual({ kind: "suggest", eatFirst: true, avoidTitles: [] });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect((await screen.findAllByText(eatFirstStartedText)).length).toBeGreaterThan(0);
  });

  it("says why when the job cannot start", async () => {
    startJob.mockResolvedValue(fail("suggest_empty_pantry"));
    show(1);
    await userEvent.setup().click(screen.getByRole("button", { name: /1 vara har legat länge/ }));
    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
