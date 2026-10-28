import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastWithShowDurationMs, ToastProvider, useToast } from "@/components/toast";
import { aiJobsClient, useShowingAiResults } from "@/lib/ai-jobs-client";
import { createFakeAiJobsServer } from "../../../../tests/support/ai-jobs-fake";
import { AiJobRow } from "./ai-job-row";
import { AiJobsProvider } from "./ai-jobs-provider";

// The provider, the job row and the sheet AI-jobb (Story 12.4, FR-46-FR-48),
// through the real client with a stand-in for the server: what the row says
// and is named, the sheet's rows and buttons, the live region that says once
// when a job starts, and the short confirmation for a finished job: with
// "Visa", for 8 s, never for a result that is on the screen, and behind an
// "Ångra".

const server = createFakeAiJobsServer();

vi.mock("../actions/job-actions", () => ({
  cancelAiJob: (id: string) => server.actions.cancel(id),
  markAiJobSeen: (id: string) => server.actions.markSeen(id),
  dismissAiJob: (id: string) => server.actions.dismiss(id),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

/** Shows a toast with "Ångra", as a delete would, and a result that is on the screen. */
function Controls() {
  const { showToast } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast("Tog bort Mjölk.", { onUndo: () => {} })}>
        Ta bort
      </button>
    </>
  );
}

function Showing({ kind }: { kind: "suggest" | "analyze" }) {
  useShowingAiResults(kind);
  return <p>Resultatet visas</p>;
}

function renderApp(extra?: React.ReactNode) {
  return render(
    <ToastProvider>
      <AiJobsProvider>
        <AiJobRow variant="bar" />
        <Controls />
        {extra}
      </AiJobsProvider>
    </ToastProvider>,
  );
}

const row = () => screen.queryByTestId("ai-job-row");
const sheet = () => screen.getByRole("dialog", { name: "AI-jobb" });

/** Starts a suggestion job the way the library does, and lets the app read the list. */
async function startJob() {
  await act(async () => {
    await aiJobsClient().start("/api/ai/jobs", { kind: "suggest", avoidTitles: [] }, crypto.randomUUID());
  });
  return server.latest;
}

beforeEach(() => {
  server.install();
  server.started.length = 0;
  for (const action of Object.values(server.actions)) action.mockClear();
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the job row", () => {
  it("is not there while no job is active, and not for a finished one", async () => {
    renderApp();
    await server.read();
    expect(row()).not.toBeInTheDocument();
    server.add({ kind: "suggest", status: "done", count: 3 }, { suggestions: [] });
    await server.read();
    expect(row()).not.toBeInTheDocument();
  });

  it("says what runs, with a name of its own for a screen reader, and is at least 44 px high", async () => {
    renderApp();
    await server.read();
    await startJob();
    const button = await screen.findByTestId("ai-job-row");
    expect(button).toHaveTextContent("AI: Letar efter rättförslag");
    expect(button).toHaveAccessibleName("AI-jobb: Letar efter rättförslag");
    expect(button).toHaveClass("min-h-tap");
    expect(button.tagName).toBe("BUTTON");
  });

  it("says how many wait behind the one that runs, and goes when nothing is active", async () => {
    renderApp();
    await server.read();
    const first = await startJob();
    server.add({ kind: "suggest", status: "queued", ahead: 1, createdAt: "2026-10-28T12:30:00.000Z" });
    server.add({ kind: "analyze", status: "queued", ahead: 2, createdAt: "2026-10-28T12:40:00.000Z" });
    await server.read();
    expect(row()).toHaveTextContent("AI: Letar efter rättförslag · 2 i kö");
    expect(row()).toHaveAccessibleName("AI-jobb: Letar efter rättförslag, 2 i kö");

    for (const { id } of server.jobs) server.finish(id, { suggestions: [] });
    await server.read();
    expect(row()).not.toBeInTheDocument();
    expect(first.id).toBeTruthy();
  });

  it("puts its height in --job-row-height for what sits above the bar, and takes it away again", async () => {
    renderApp();
    await server.read();
    expect(document.documentElement.style.getPropertyValue("--job-row-height")).toBe("");
    await startJob();
    await screen.findByTestId("ai-job-row");
    expect(document.documentElement.style.getPropertyValue("--job-row-height")).toMatch(/^\d+px$/);
    server.finish(server.latest.id, { suggestions: [] });
    await server.read();
    expect(document.documentElement.style.getPropertyValue("--job-row-height")).toBe("");
  });

  it("opens the sheet AI-jobb with a tap", async () => {
    const user = userEvent.setup();
    renderApp();
    await server.read();
    await startJob();
    await user.click(await screen.findByTestId("ai-job-row"));
    expect(sheet()).toBeInTheDocument();
  });
});

describe("the sheet AI-jobb", () => {
  async function openSheet() {
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("ai-job-row"));
    return user;
  }

  it("has a row per job with what it is about and how it is going, and Avbryt with the job's name for a job that is active", async () => {
    renderApp();
    await server.read();
    const first = await startJob();
    server.add({ kind: "suggest", status: "queued", ahead: 1, createdAt: "2026-10-28T12:30:00.000Z" });
    await server.read();
    const user = await openSheet();

    const rows = within(sheet()).getAllByTestId("ai-job");
    expect(rows).toHaveLength(2);
    // Newest first.
    expect(rows[0]).toHaveTextContent("Rättförslag");
    expect(rows[0]).toHaveTextContent("I kö, 1 före");
    expect(rows[1]).toHaveTextContent("Pågår");
    await user.click(within(rows[1]).getByRole("button", { name: "Avbryt rättförslag" }));
    expect(server.actions.cancel).toHaveBeenCalledWith(first.id);
    // Without a question, and it goes at once.
    expect(within(sheet()).getAllByTestId("ai-job")).toHaveLength(1);
  });

  it("has Visa for a finished job, which closes the sheet, reveals the result and opens its page", async () => {
    renderApp();
    await server.read();
    await startJob();
    server.add({ kind: "suggest", status: "done", count: 3, createdAt: "2026-10-28T12:30:00.000Z" }, { suggestions: [] });
    await server.read();
    const user = await openSheet();

    const done = within(sheet()).getAllByTestId("ai-job").find((item) => within(item).queryByText("Klart"));
    expect(done).toBeDefined();
    await user.click(within(done!).getByRole("button", { name: "Visa rättförslag" }));
    expect(push).toHaveBeenCalledWith("/recept");
    expect(aiJobsClient().getSnapshot().reveals.suggest).toBe(1);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "AI-jobb" })).not.toBeInTheDocument());
  });

  it("says why a job did not go, with Försök igen, which starts a new one in place of it", async () => {
    renderApp();
    await server.read();
    const failed = server.add({ kind: "suggest", status: "failed", errorCode: "ai_job_lost" });
    const second = server.add({ kind: "suggest", status: "running", createdAt: "2026-10-28T12:30:00.000Z" });
    await server.read();
    const user = await openSheet();

    const item = within(sheet()).getAllByTestId("ai-job").find((shown) => within(shown).queryByText("Gick inte"));
    expect(item).toHaveTextContent("AI-jobbet avbröts. Försök igen.");
    await user.click(within(item!).getByRole("button", { name: "Försök igen med rättförslag" }));
    expect(server.actions.dismiss).toHaveBeenCalledWith(failed.id);
    await waitFor(() => expect(server.started).toHaveLength(1));
    expect(server.started[0].body).toMatchObject({ kind: "suggest", avoidTitles: [] });
    expect(second.id).toBeTruthy();
  });

  it("shows the error in a notice when Försök igen cannot start a job", async () => {
    renderApp();
    await server.read();
    server.add({ kind: "suggest", status: "failed", errorCode: "ai_invalid" });
    server.add({ kind: "suggest", status: "running", createdAt: "2026-10-28T12:30:00.000Z" });
    await server.read();
    const user = await openSheet();
    server.failNextStart("ai_queue_full");
    await user.click(within(sheet()).getByRole("button", { name: "Försök igen med rättförslag" }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det finns redan tre AI-jobb. Vänta tills ett är klart.");
  });

  it("marks nothing as seen: a result is seen on its own page", async () => {
    renderApp();
    await server.read();
    server.add({ kind: "suggest", status: "done", count: 3 }, { suggestions: [] });
    server.add({ kind: "suggest", status: "running", createdAt: "2026-10-28T12:30:00.000Z" });
    await server.read();
    await openSheet();
    expect(server.actions.markSeen).not.toHaveBeenCalled();
  });
});

describe("the live region", () => {
  it("says once that a job is in the queue when one starts, and nothing for what was there at the start or for a poll", async () => {
    // A job that is active when the app loads is not new.
    server.add({ kind: "suggest", status: "running" });
    renderApp();
    await server.read();
    const region = () => screen.getAllByRole("status").find((element) => element.className.includes("sr-only") && element.textContent !== undefined)!;
    expect(screen.queryByText("AI-jobbet står i kön.")).not.toBeInTheDocument();
    expect(screen.queryByText("AI-jobbet har startat.")).not.toBeInTheDocument();
    await server.read();
    expect(screen.queryByText(/AI-jobbet/)).not.toBeInTheDocument();

    await act(async () => {
      await aiJobsClient().start("/api/ai/jobs", { kind: "suggest" }, crypto.randomUUID());
    });
    server.queue(server.latest.id, 1);
    await server.read();
    // The new one started running at once in the stand-in; it is announced once as started.
    expect(screen.getAllByText(/AI-jobbet (står i kön|har startat)\./)).toHaveLength(1);
    await server.read();
    expect(screen.getAllByText(/AI-jobbet (står i kön|har startat)\./)).toHaveLength(1);
    expect(region()).toBeTruthy();
  });
});

describe("the short confirmation for a finished job", () => {
  /** A job is started here, and ends. */
  async function startAndFinish(count = 3) {
    await server.read();
    const { id } = await startJob();
    server.finish(id, { suggestions: [] }, count);
    await server.read();
    return id;
  }

  it("says what is there, with Visa, for 8 s, and never takes focus", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Ta bort" }));
    await user.click(await screen.findByRole("button", { name: "Ångra" }));
    const button = screen.getByRole("button", { name: "Ta bort" });
    button.focus();

    await startAndFinish();
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("3 rättförslag är klara.");
    expect(within(toast).getByRole("button", { name: "Visa" })).toBeInTheDocument();
    expect(toastWithShowDurationMs).toBe(8000);
    // Read out politely, and no focus moved.
    expect(screen.getAllByRole("status").some((region) => region.textContent === "3 rättförslag är klara.")).toBe(true);
    expect(button).toHaveFocus();
    // The word "jobb" is only in the job row and the sheet.
    expect(toast).not.toHaveTextContent(/jobb/i);
  });

  it("goes after 8 s, and not before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderApp();
    await startAndFinish();
    expect(await screen.findByTestId("toast")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_900);
    });
    expect(screen.getByTestId("toast")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("Visa reveals the result and opens its page, and closes the confirmation", async () => {
    const user = userEvent.setup();
    renderApp();
    await startAndFinish();
    await user.click(within(await screen.findByTestId("toast")).getByRole("button", { name: "Visa" }));
    expect(push).toHaveBeenCalledWith("/recept");
    expect(aiJobsClient().getSnapshot().reveals.suggest).toBe(1);
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("is not shown for a result that is on the screen", async () => {
    renderApp(<Showing kind="suggest" />);
    await startAndFinish();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("is shown for a result of another kind than the one on the screen", async () => {
    renderApp(<Showing kind="analyze" />);
    await startAndFinish();
    expect(await screen.findByTestId("toast")).toHaveTextContent("3 rättförslag är klara.");
  });

  it("says that it did not go, for a job that failed, with Visa", async () => {
    renderApp();
    await server.read();
    const { id } = await startJob();
    server.failJob(id, "ai_invalid");
    await server.read();
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Det gick inte att ta fram rättförslag.");
    expect(within(toast).getByRole("button", { name: "Visa" })).toBeInTheDocument();
  });

  it("is one for several jobs that finish together, and Visa opens the sheet", async () => {
    const user = userEvent.setup();
    renderApp();
    await server.read();
    const first = await startJob();
    const other = server.add({ kind: "suggest", status: "running", createdAt: "2026-10-28T12:30:00.000Z" });
    await server.read();
    server.finish(first.id, { suggestions: [] }, 3);
    server.finish(other.id, { suggestions: [] }, 1);
    await server.read();
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("2 AI-resultat är klara.");
    await user.click(within(toast).getByRole("button", { name: "Visa" }));
    expect(await screen.findByRole("dialog", { name: "AI-jobb" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("gives no confirmation for a job that was cancelled or went away from the list", async () => {
    renderApp();
    await server.read();
    const { id } = await startJob();
    server.remove(id);
    await server.read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("waits for an Ångra toast that is showing, and comes when it has gone", async () => {
    const user = userEvent.setup();
    renderApp();
    await server.read();
    const { id } = await startJob();
    await user.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(screen.getByTestId("toast")).toHaveTextContent("Tog bort Mjölk.");

    server.finish(id, { suggestions: [] }, 3);
    await server.read();
    // The undo of what Pontus just did is not taken.
    expect(screen.getByTestId("toast")).toHaveTextContent("Tog bort Mjölk.");
    expect(screen.getByRole("button", { name: "Ångra" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ångra" }));
    expect(await screen.findByText("3 rättförslag är klara.", { selector: "p" })).toBeInTheDocument();
  });
});
