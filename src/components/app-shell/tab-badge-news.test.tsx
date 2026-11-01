import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAiJobsServer } from "../../../tests/support/ai-jobs-fake";
import { TabBar } from "./tab-bar";

// Brickor (Story 23.1): the badge on Inköpslista and Förråd for what someone
// else added since this device last looked. Förråd's AI badge and its new
// cards are one number, each card once, and the tab's name says it.

const news = vi.hoisted(() => ({ current: { lista: [] as string[], prylar: [] as string[] } }));
vi.mock("@/lib/news-client", () => ({ useNews: () => news.current, noteOwnNews: () => {} }));
const pathname = vi.hoisted(() => ({ current: "/recept" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const server = createFakeAiJobsServer();
const tab = (name: string | RegExp) => within(screen.getByRole("navigation", { name: "Huvudmeny" })).getByRole("link", { name });

beforeEach(() => {
  server.install();
  pathname.current = "/recept";
  news.current = { lista: [], prylar: [] };
});

describe("the news badge", () => {
  it("counts what others added on Inköpslista, and names the tab after it", () => {
    news.current = { lista: ["item:1", "check:r:2", "check:r:3"], prylar: [] };
    render(<TabBar />);
    expect(within(tab("Inköpslista, 3 nya ändringar")).getByTestId("tab-badge")).toHaveTextContent("3");
    expect(within(tab("Förråd")).queryByTestId("tab-badge")).not.toBeInTheDocument();
  });

  it("is never on the tab that is open", () => {
    pathname.current = "/lista";
    news.current = { lista: ["item:1"], prylar: [] };
    render(<TabBar />);
    expect(within(tab(/Inköps/)).queryByTestId("tab-badge")).not.toBeInTheDocument();
  });

  it("counts a card on Förråd once, whether it is new from another phone, read by the AI, or both", async () => {
    news.current = { lista: [], prylar: ["card:p1", "card:p2"] };
    render(<TabBar />);
    server.add({ kind: "things", status: "done", count: 2, context: { photoId: "p1" } });
    server.add({ kind: "things", status: "done", count: 1, context: { photoId: "p3" } });
    await server.read();
    expect(within(tab("Förråd, 3 nya kort")).getByTestId("tab-badge")).toHaveTextContent("3");
  });
});
