import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import type { Thing } from "../domain/thing";
import { CardThings } from "./card-things";
import { WorthBlock, WorthMarker } from "./worth-marker";

// Värt en titt (Tillval): the star on a row and the block in the sheet show only with the switch on and a
// tip on the föremål; the words are in the sheet, and no price anywhere.

vi.mock("../actions/thing-item", () => ({ updateThing: vi.fn(), removeThing: vi.fn(), restoreThing: vi.fn() }));
vi.mock("../actions/thing-count", () => ({
  loadThingCount: async (itemId: string) => ({ ok: true, data: { itemId, quantity: null, changes: [] } }),
  setThingCount: vi.fn(),
}));
const loadThingDetail = vi.fn();
vi.mock("../actions/thing-detail", () => ({ loadThingDetail: (id: string) => loadThingDetail(id) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const worth = { why: "Ser ut som Gustavsberg, Stig Lindberg. Titta på botten efter stämpel.", confidence: "guess" } as const;
const vase: Thing = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a21", name: "Vas", category: "Hushåll", whereHint: null, confidence: "high", seenOn: 1, worth };
const hammer: Thing = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a22", name: "Hammare", category: "Verktyg", whereHint: null, confidence: "high", seenOn: 1 };
const detail = {
  photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  source: "photo",
  box: null,
  place: { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02", siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03", room: "Garaget", roomKey: "garaget", part: "Hylla 2", kind: "part" },
  cardThings: [],
  worth,
};

beforeEach(() => {
  window.localStorage.clear();
  loadThingDetail.mockReset();
  loadThingDetail.mockResolvedValue(ok(detail));
});

describe("the star on a row", () => {
  it("shows with a name for a screen reader when the switch is on and the föremål has a tip", () => {
    saveOption("worthLook", true);
    render(<WorthMarker worth={worth} />);
    expect(screen.getByRole("img", { name: "Värt en titt, gissning" })).toBeInTheDocument();
  });

  it("shows nothing with the switch off, or without a tip", () => {
    const { rerender } = render(<WorthMarker worth={worth} />);
    expect(screen.queryByTestId("worth-marker")).not.toBeInTheDocument();
    saveOption("worthLook", true);
    rerender(<WorthMarker worth={null} />);
    expect(screen.queryByTestId("worth-marker")).not.toBeInTheDocument();
  });
});

describe("the block in the sheet", () => {
  it("says the sentence, how sure the AI is in words, and that it is a tip, with the switch on", () => {
    saveOption("worthLook", true);
    render(<WorthBlock worth={worth} />);
    const block = screen.getByTestId("worth-block");
    expect(within(block).getByText("Värt en titt")).toBeInTheDocument();
    expect(block).toHaveTextContent(worth.why);
    expect(screen.getByTestId("worth-confidence")).toHaveTextContent("Gissning");
    expect(block).toHaveTextContent("Ett tips, inte en värdering.");
    expect(block).not.toHaveTextContent(/kr\b|kronor|\$/);
  });

  it("shows nothing with the switch off", () => {
    render(<WorthBlock worth={worth} />);
    expect(screen.queryByTestId("worth-block")).not.toBeInTheDocument();
  });
});

describe("in the room's list", () => {
  it("puts the star only on the föremål with a tip, and only with the switch on", () => {
    saveOption("worthLook", true);
    render(
      <ToastProvider>
        <CardThings things={[vase, hammer]} aside />
      </ToastProvider>,
    );
    expect(screen.getAllByTestId("worth-marker")).toHaveLength(1);
    expect(within(screen.getByRole("button", { name: /Vas/ })).getByTestId("worth-marker")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Hammare/ })).queryByTestId("worth-marker")).not.toBeInTheDocument();
  });

  it("opens the sheet with the block under the name", async () => {
    saveOption("worthLook", true);
    render(
      <ToastProvider>
        <CardThings things={[vase, hammer]} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Vas/ }));
    const dialog = screen.getByRole("dialog", { name: "Föremål" });
    expect(await within(dialog).findByTestId("worth-block")).toHaveTextContent(worth.why);
  });

  it("shows no star and no block with the switch off", async () => {
    render(
      <ToastProvider>
        <CardThings things={[vase, hammer]} />
      </ToastProvider>,
    );
    expect(screen.queryByTestId("worth-marker")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Vas/ }));
    const dialog = screen.getByRole("dialog", { name: "Föremål" });
    await within(dialog).findByRole("textbox", { name: "Vad är det?" });
    expect(within(dialog).queryByTestId("worth-block")).not.toBeInTheDocument();
  });
});
