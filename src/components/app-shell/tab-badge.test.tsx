import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAiJobsServer } from "../../../tests/support/ai-jobs-fake";
import { SideMenu } from "./side-menu";
import { TabBar } from "./tab-bar";
import { badgeName } from "./tab-badge";

// The badge on Recept and Förråd for finished AI jobs that Pontus has not
// seen (Story 12.4, FR-48, DESIGN.md tab-badge): the count, "9+", never on the
// tab he stands on, a name for a screen reader that says the same as the
// number, and the job row above the tabs (EXPERIENCE.md, Accessibility).

const server = createFakeAiJobsServer();
const pathname = vi.hoisted(() => ({ current: "/lista" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const tab = (name: string | RegExp) => within(screen.getByRole("navigation", { name: "Huvudmeny" })).getByRole("link", { name });

beforeEach(() => {
  server.install();
  pathname.current = "/lista";
});

async function withJobs(...jobs: Parameters<typeof server.add>[0][]) {
  for (const job of jobs) server.add(job);
  await server.read();
}

describe("the badge on a tab", () => {
  it("counts the finished jobs that have not been seen, also those that did not go, and names the tab after it", async () => {
    render(<TabBar />);
    await withJobs(
      { kind: "suggest", status: "done", count: 3 },
      { kind: "import", status: "failed", errorCode: "ai_invalid" },
      { kind: "analyze", status: "done", count: 14 },
    );
    const recept = tab("Recept, 2 nya AI-resultat");
    expect(within(recept).getByTestId("tab-badge")).toHaveTextContent("2");
    const lagersaldo = tab("Förråd, 1 nytt AI-resultat");
    expect(within(lagersaldo).getByTestId("tab-badge")).toHaveTextContent("1");
    // The tabs without results have no badge and keep their names.
    expect(within(tab("Matsedel")).queryByTestId("tab-badge")).not.toBeInTheDocument();
    expect(within(tab(/Inköps/)).queryByTestId("tab-badge")).not.toBeInTheDocument();
  });

  it("is accent with the text on it, never red, at least 18 px, and hidden from a screen reader (the tab's name says it)", async () => {
    render(<TabBar />);
    await withJobs({ kind: "suggest", status: "done", count: 1 });
    const badge = screen.getByTestId("tab-badge");
    expect(badge).toHaveClass("bg-accent", "text-surface", "rounded-full", "min-w-[18px]", "h-[18px]");
    expect(badge.className).not.toMatch(/red|danger|error/);
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("says 9+ over nine", async () => {
    render(<TabBar />);
    await withJobs(...Array.from({ length: 10 }, () => ({ kind: "suggest" as const, status: "done" as const, count: 1 })));
    expect(screen.getByTestId("tab-badge")).toHaveTextContent("9+");
    expect(badgeName("Recept", 10)).toBe("Recept, 10 nya AI-resultat");
  });

  it("does not count a job that is active, has been seen, or was cancelled", async () => {
    render(<TabBar />);
    await withJobs(
      { kind: "suggest", status: "running" },
      { kind: "suggest", status: "queued" },
      { kind: "suggest", status: "done", seen: true, count: 1 },
    );
    expect(screen.queryByTestId("tab-badge")).not.toBeInTheDocument();
  });

  it("is not on the tab Pontus stands on, also on a page below it", async () => {
    pathname.current = "/recept";
    render(<TabBar />);
    await withJobs({ kind: "suggest", status: "done", count: 3 }, { kind: "analyze", status: "done", count: 2 });
    expect(within(tab("Recept")).queryByTestId("tab-badge")).not.toBeInTheDocument();
    expect(within(tab("Förråd, 1 nytt AI-resultat")).getByTestId("tab-badge")).toBeInTheDocument();
  });

  it("is on the side menu too, where the same rules hold", async () => {
    pathname.current = "/hemma";
    render(<SideMenu />);
    await withJobs({ kind: "suggest", status: "done", count: 3 }, { kind: "analyze", status: "done", count: 2 });
    expect(within(tab("Recept, 1 nytt AI-resultat")).getByTestId("tab-badge")).toHaveTextContent("1");
    expect(within(tab("Förråd")).queryByTestId("tab-badge")).not.toBeInTheDocument();
  });
});

describe("the job row in the bar and the menu", () => {
  it("is the first thing in the tab bar, above the tabs, and at the top of the side menu under Matkoll", () => {
    const { unmount } = render(<TabBar jobRow={<p data-testid="job-row">rad</p>} />);
    const bar = screen.getByRole("navigation", { name: "Huvudmeny" });
    expect(bar.firstElementChild).toBe(screen.getByTestId("job-row"));
    unmount();

    render(<SideMenu jobRow={<p data-testid="job-row">rad</p>} />);
    const menu = screen.getByRole("navigation", { name: "Huvudmeny" });
    expect(menu.children[0]).toHaveTextContent("Matkoll");
    expect(menu.children[1]).toContainElement(screen.getByTestId("job-row"));
  });
});
