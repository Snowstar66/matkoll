import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import type { ThingChange } from "../domain/thing-count";
import type { ThingHit } from "../domain/thing-search";
import { CountCard } from "./count-card";
import { RankedHits } from "./hit-rows";

const changeThingCount = vi.fn();
const undoThingChange = vi.fn();
const setThingCount = vi.fn();
const stopThingCount = vi.fn();
const restoreThingCount = vi.fn();
const loadThingCount = vi.fn();
vi.mock("../actions/thing-count", () => ({
  changeThingCount: (input: unknown) => changeThingCount(input),
  undoThingChange: (id: string) => undoThingChange(id),
  setThingCount: (input: unknown) => setThingCount(input),
  stopThingCount: (id: string) => stopThingCount(id),
  restoreThingCount: (snapshot: unknown) => restoreThingCount(snapshot),
  loadThingCount: (id: string) => loadThingCount(id),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const itemId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";
const changeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a99";
const gravljus: ThingHit = {
  id: itemId,
  name: "Gravljus",
  category: "Hushåll",
  whereHint: null,
  seenOn: 1,
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
  siteName: "Hemma",
  room: "Förrådet",
  roomKey: "förrådet",
  part: "Översta hyllan",
  isBox: false,
  photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04",
  takenAt: "2026-10-12T10:00:00Z",
  written: false,
  noted: false,
  score: 1,
  quantity: 5,
};

let next = 0;
const change = (kind: ThingChange["kind"], at: string, quantityAfter: number, delta: number | null = null): ThingChange => ({
  id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  kind,
  delta,
  quantityAfter,
  cleared: null,
  at,
});

beforeEach(() => {
  for (const mock of [changeThingCount, undoThingChange, setThingCount, stopThingCount, restoreThingCount, loadThingCount, refresh]) mock.mockReset();
});

function hits(hit: ThingHit) {
  render(
    <ToastProvider>
      <RankedHits best={[hit]} similar={[]} label="Träffar" />
    </ToastProvider>,
  );
}

describe("a counted hit (Story 18.23)", () => {
  it("shows the count first in its line, with Ta and Fyll på as buttons of their own beside the row and its thumbnail", () => {
    hits(gravljus);
    expect(screen.getByTestId("hit-count")).toHaveTextContent("5 st");
    expect(screen.getByTestId("thing-hit")).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("link", { name: "Visa Gravljus på kortet" })).toHaveAttribute("href", expect.stringContaining("/prylar/kort/"));
    expect(screen.getByRole("button", { name: "Ta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fyll på" })).toBeInTheDocument();
  });

  it("takes 2 with the stepper in two more taps, shows 3 st and a toast with Ångra that gives them back", async () => {
    changeThingCount.mockResolvedValue(ok({ changeId, quantity: 3 }));
    undoThingChange.mockResolvedValue(ok({ quantity: 5 }));
    hits(gravljus);
    await userEvent.click(screen.getByRole("button", { name: "Ta" }));
    const step = screen.getByTestId("count-step");
    expect(within(step).getByRole("button", { name: "Ta 1" })).toHaveFocus();
    expect(within(step).getByRole("button", { name: "Ta färre" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(step).getByRole("button", { name: "Ta fler" }));
    await userEvent.click(within(step).getByRole("button", { name: "Ta 2" }));
    await waitFor(() => expect(changeThingCount).toHaveBeenCalledWith({ itemId, delta: -2 }));
    expect((await screen.findAllByText("Tog 2 gravljus.")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("hit-count")).toHaveTextContent("3 st");
    expect(screen.getByRole("button", { name: "Ta" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(undoThingChange).toHaveBeenCalledWith(changeId));
    await waitFor(() => expect(screen.getByTestId("hit-count")).toHaveTextContent("5 st"));
  });

  it("stops + at the count there is when taking, and steps with the arrows, confirms with Enter and cancels with Esc", async () => {
    changeThingCount.mockResolvedValue(ok({ changeId, quantity: 7 }));
    hits({ ...gravljus, quantity: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Ta" }));
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("button", { name: "Ta 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ta fler" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("count-step")).not.toBeInTheDocument();
    expect(changeThingCount).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Fyll på" }));
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{Enter}");
    await waitFor(() => expect(changeThingCount).toHaveBeenCalledWith({ itemId, delta: 5 }));
    expect((await screen.findAllByText("Fyllde på 5 gravljus.")).length).toBeGreaterThan(0);
  });

  it("says Slut quietly at 0 and offers only Fyll på; nothing goes on the shopping list", () => {
    hits({ ...gravljus, quantity: 0 });
    expect(screen.getByTestId("hit-count")).toHaveTextContent("Slut");
    expect(screen.getByTestId("hit-count")).toHaveClass("text-ink-3");
    expect(screen.queryByRole("button", { name: "Ta" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fyll på" })).toBeInTheDocument();
    expect(screen.queryByText(/inköpslista/i)).not.toBeInTheDocument();
  });

  it("looks as before for a föremål without a count", () => {
    hits({ ...gravljus, quantity: null });
    expect(screen.queryByTestId("hit-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ta" })).not.toBeInTheDocument();
  });
});

describe("the count card in a föremål's sheet (Story 18.23)", () => {
  const history = [
    change("take", "2026-11-04T10:00:00Z", 3, -2),
    change("refill", "2026-11-03T10:00:00Z", 5, 2),
    change("take", "2026-11-01T10:00:00Z", 3, -2),
    change("take", "2026-10-30T10:00:00Z", 5, -1),
    change("refill", "2026-10-20T10:00:00Z", 6, 1),
    change("take", "2026-10-15T10:00:00Z", 5, -1),
    change("card", "2026-10-12T10:00:00Z", 6),
  ];

  it("shows the count, the line, and the latest five changes newest first with Visa alla", async () => {
    loadThingCount.mockResolvedValue(ok({ itemId, quantity: 3, changes: history }));
    render(<CountCard itemId={itemId} name="Gravljus" initial={3} />);
    expect(screen.getByTestId("count-number")).toHaveTextContent("3st");
    expect(await screen.findByText("Du borde ha 3 kvar · kortet 12 okt visade 6")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ändringar" })).toBeInTheDocument();
    const rows = screen.getAllByTestId("count-change");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("−2Tog4 nov");
    expect(rows[1]).toHaveTextContent("+2Fyllde på3 nov");
    await userEvent.click(screen.getByRole("button", { name: "Visa alla 7" }));
    expect(screen.getAllByTestId("count-change")).toHaveLength(7);
    expect(screen.getAllByTestId("count-change")[6]).toHaveTextContent("6Nytt kort12 okt");
    expect(screen.getByRole("button", { name: "Rätta antalet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sluta räkna" })).toBeInTheDocument();
  });

  it("names someone else before the verb and leaves my own changes as they were (Story 21.3)", async () => {
    const martina = { name: "Martina", tone: "sky" as const };
    loadThingCount.mockResolvedValue(
      ok({ itemId, quantity: 3, changes: [{ ...change("take", "2026-11-04T10:00:00Z", 3, -2), who: martina }, change("refill", "2026-11-03T10:00:00Z", 5, 2)] }),
    );
    render(<CountCard itemId={itemId} name="Gravljus" initial={3} />);
    await waitFor(() => expect(screen.getAllByTestId("count-change")).toHaveLength(2));
    expect(screen.getAllByTestId("count-change")[0]).toHaveTextContent("−2Martina tog4 nov");
    expect(screen.getAllByTestId("count-change")[1]).toHaveTextContent("+2Fyllde på3 nov");
  });

  it("says who else last changed a föremål without a count (Story 21.3)", async () => {
    loadThingCount.mockResolvedValue(
      ok({ itemId, quantity: null, changes: [], lastChange: { name: "Martina", tone: "sky", at: "2026-10-20T10:00:00.000Z", added: false } }),
    );
    render(<CountCard itemId={itemId} name="Hammare" initial={null} />);
    expect(await screen.findByTestId("thing-last-change")).toHaveTextContent("Martina ändrade · 20 okt");
  });

  it("takes in the card at once and says so there with Ångra, since a toast would be behind the sheet", async () => {
    loadThingCount.mockResolvedValueOnce(ok({ itemId, quantity: 3, changes: history }));
    loadThingCount.mockResolvedValue(ok({ itemId, quantity: 2, changes: [change("take", new Date().toISOString(), 2, -1), ...history] }));
    changeThingCount.mockResolvedValue(ok({ changeId, quantity: 2 }));
    undoThingChange.mockResolvedValue(ok({ quantity: 3 }));
    render(<CountCard itemId={itemId} name="Gravljus" initial={3} />);
    await screen.findByText("Du borde ha 3 kvar · kortet 12 okt visade 6");
    await userEvent.click(screen.getByRole("button", { name: "Ta" }));
    await userEvent.click(screen.getByRole("button", { name: "Ta 1" }));
    await waitFor(() => expect(changeThingCount).toHaveBeenCalledWith({ itemId, delta: -1 }));
    const done = await screen.findByTestId("count-done");
    expect(done).toHaveTextContent("Tog 1 gravljus.");
    expect(screen.getByTestId("count-number")).toHaveTextContent("2st");
    await waitFor(() => expect(screen.getAllByTestId("count-change")[0]).toHaveTextContent("−1Togi dag"));
    expect(refresh).toHaveBeenCalled();
    await userEvent.click(within(done).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(undoThingChange).toHaveBeenCalledWith(changeId));
  });

  it("has Antal · räknas inte with Räkna for a föremål without a count, which saves a count from 1", async () => {
    loadThingCount.mockResolvedValueOnce(ok({ itemId, quantity: null, changes: [] }));
    loadThingCount.mockResolvedValue(ok({ itemId, quantity: 2, changes: [change("set", new Date().toISOString(), 2)] }));
    setThingCount.mockResolvedValue(ok({ changeId, quantity: 2 }));
    render(<CountCard itemId={itemId} name="Hammare" initial={null} />);
    expect(screen.getByText("· räknas inte")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Räkna" }));
    await userEvent.click(screen.getByRole("button", { name: "Fler" }));
    await userEvent.click(screen.getByRole("button", { name: "Spara antal" }));
    await waitFor(() => expect(setThingCount).toHaveBeenCalledWith({ itemId, quantity: 2 }));
    expect(await screen.findByText("Du skrev 2 den " + new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).format(new Date()).replace(".", ""))).toBeInTheDocument();
  });

  it("stops counting and puts the count back with Ångra", async () => {
    const snapshot = { item: itemId, quantity: 3, changes: [] };
    loadThingCount.mockResolvedValueOnce(ok({ itemId, quantity: 3, changes: history }));
    loadThingCount.mockResolvedValue(ok({ itemId, quantity: null, changes: [] }));
    stopThingCount.mockResolvedValue(ok(snapshot));
    restoreThingCount.mockResolvedValue(ok(null));
    render(<CountCard itemId={itemId} name="Gravljus" initial={3} />);
    await screen.findByText("Du borde ha 3 kvar · kortet 12 okt visade 6");
    await userEvent.click(screen.getByRole("button", { name: "Sluta räkna" }));
    expect(await screen.findByText("Slutade räkna gravljus.")).toBeInTheDocument();
    expect(screen.getByText("· räknas inte")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreThingCount).toHaveBeenCalledWith(snapshot));
  });

  it("takes it quietly when the count was already stopped elsewhere, with nothing to undo", async () => {
    loadThingCount.mockResolvedValueOnce(ok({ itemId, quantity: 3, changes: history }));
    loadThingCount.mockResolvedValue(ok({ itemId, quantity: null, changes: [] }));
    stopThingCount.mockResolvedValue(ok(null));
    render(<CountCard itemId={itemId} name="Gravljus" initial={3} />);
    await screen.findByText("Du borde ha 3 kvar · kortet 12 okt visade 6");
    await userEvent.click(screen.getByRole("button", { name: "Sluta räkna" }));
    expect(await screen.findByText("· räknas inte")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ångra" })).not.toBeInTheDocument();
  });

  it("says when Ångra is not for the newest change", async () => {
    loadThingCount.mockResolvedValue(ok({ itemId, quantity: 3, changes: history }));
    changeThingCount.mockResolvedValue(ok({ changeId, quantity: 2 }));
    undoThingChange.mockResolvedValue({ ok: false, error: { code: "things_undo_not_latest", message: "Det går bara att ångra den senaste ändringen." } });
    render(<CountCard itemId={itemId} name="Gravljus" initial={3} />);
    await screen.findByText("Du borde ha 3 kvar · kortet 12 okt visade 6");
    await userEvent.click(screen.getByRole("button", { name: "Ta" }));
    await userEvent.click(screen.getByRole("button", { name: "Ta 1" }));
    await userEvent.click(within(await screen.findByTestId("count-done")).getByRole("button", { name: "Ångra" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det går bara att ångra den senaste ändringen.");
  });
});
