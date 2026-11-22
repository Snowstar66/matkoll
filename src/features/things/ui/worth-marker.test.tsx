import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import type { Thing } from "../domain/thing";
import { CardThings } from "./card-things";
import { WorthBlock, WorthMarker } from "./worth-marker";

// Värdetips (Tillval): the star on a row and the block in the sheet show only with the switch on and a
// tip on the föremål; the words are in the sheet, and no price anywhere.

vi.mock("../actions/thing-item", () => ({ updateThing: vi.fn(), removeThing: vi.fn(), restoreThing: vi.fn() }));
vi.mock("../actions/thing-count", () => ({
  loadThingCount: async (itemId: string) => ({ ok: true, data: { itemId, quantity: null, changes: [] } }),
  setThingCount: vi.fn(),
}));
const explainWorthDetail = vi.fn();
vi.mock("./worth-client", () => ({ explainWorthDetail: (id: string) => explainWorthDetail(id) }));
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
  explainWorthDetail.mockReset();
  loadThingDetail.mockReset();
  loadThingDetail.mockResolvedValue(ok(detail));
});

describe("the pill on a row", () => {
  it("says Kan ha värde in words (and how sure for a screen reader) when the switch is on and the föremål has a tip", () => {
    saveOption("worthLook", true);
    render(<WorthMarker worth={worth} />);
    const pill = screen.getByTestId("worth-marker");
    expect(pill).toHaveTextContent("Kan ha värde, gissning");
    expect(pill.className).toContain("bg-star-tint");
    expect(within(pill).getByText(", gissning")).toHaveClass("sr-only");
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
    expect(within(block).getByText("Kan ha värde")).toBeInTheDocument();
    expect(block).toHaveTextContent(worth.why);
    expect(screen.getByTestId("worth-confidence")).toHaveTextContent("Gissning");
    expect(block).toHaveTextContent("Ett tips, inte en värdering.");
    expect(block).not.toHaveTextContent(/kr\b|kronor|\$/);
  });

  it("shows nothing with the switch off", () => {
    render(<WorthBlock worth={worth} />);
    expect(screen.queryByTestId("worth-block")).not.toBeInTheDocument();
  });

  it("offers searches for sold lookalikes in a new tab, from the föremål's name before there is an explanation", () => {
    saveOption("worthLook", true);
    render(<WorthBlock worth={worth} name="Vas i glas" />);
    const sold = screen.getByTestId("worth-sold");
    const tradera = within(sold).getByTestId("worth-sold-tradera");
    expect(tradera).toHaveAttribute("href", "https://www.tradera.com/search?q=Vas%20i%20glas&itemStatus=Ended");
    expect(tradera).toHaveAttribute("target", "_blank");
    expect(tradera.getAttribute("rel")).toContain("noopener");
    expect(within(tradera).getByText(", öppnas på en annan sajt")).toHaveClass("sr-only");
    expect(within(sold).getByTestId("worth-sold-ebay")).toHaveAttribute("href", expect.stringContaining("LH_Sold=1"));
    expect(within(sold).getByTestId("worth-sold-bukowskis")).toHaveTextContent("via Google");
    expect(screen.getByTestId("worth-sold-phrase")).toHaveTextContent("Söker på: Vas i glas");
    expect(sold).toHaveTextContent("Sökning på sålda föremål öppnas på en annan sajt. Priserna beror på skick och märke.");
    expect(sold).not.toHaveTextContent(/\d+\s?kr\b|kronor/);
  });

  it("searches with the explanation's own phrase when it has one, and shows no links without any phrase", () => {
    saveOption("worthLook", true);
    const text =
      "Därför markerades den\nSlipad kant.\n\nVad det kan vara\nTroligen Orrefors, en gissning.\n\nAtt undersöka vidare\n- Titta på botten.\n\nSökfras\nOrrefors kristallskål slipad";
    const { unmount } = render(<WorthBlock worth={{ ...worth, detail: text }} name="Skål" />);
    expect(screen.getByTestId("worth-sold-tradera")).toHaveAttribute("href", expect.stringContaining("Orrefors%20kristallsk%C3%A5l%20slipad"));
    expect(screen.getByTestId("worth-sold-phrase")).toHaveTextContent("Söker på: Orrefors kristallskål slipad");
    // The phrase is for the links, not another paragraph of the explanation.
    expect(screen.getByTestId("worth-detail")).not.toHaveTextContent("Sökfras");
    unmount();
    render(<WorthBlock worth={worth} name=" " />);
    expect(screen.queryByTestId("worth-sold")).not.toBeInTheDocument();
  });

  it("uses the name for an explanation kept before the search phrase existed", () => {
    saveOption("worthLook", true);
    const old = "Därför markerades den\nSlipad kant.\n\nVad det kan vara\nTroligen Orrefors.\n\nAtt undersöka vidare\n- Titta på botten.";
    render(<WorthBlock worth={{ ...worth, detail: old }} name="Kristallskål" />);
    expect(screen.getByTestId("worth-sold-phrase")).toHaveTextContent("Söker på: Kristallskål");
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

const explanationText = [
  "Därför markerades den\nFormen och den slipade kanten liknar äldre kristall.",
  "Vad det kan vara\nTroligen svensk kristall, men det här är en gissning.",
  "Att undersöka vidare\n- Titta på undersidan efter en signatur.\n- Jämför med sålda annonser.",
].join("\n\n");

describe("Undersök värdet", () => {
  it("has no button without the föremål's id, and none with the switch off", () => {
    saveOption("worthLook", true);
    const { rerender } = render(<WorthBlock worth={worth} />);
    expect(screen.queryByTestId("worth-explain")).not.toBeInTheDocument();
    window.localStorage.clear();
    rerender(<WorthBlock worth={worth} thingId={vase.id} />);
    expect(screen.queryByTestId("worth-explain")).not.toBeInTheDocument();
  });

  it("asks once, shows that it is thinking, then the three labelled parts and the tip line, and no button", async () => {
    saveOption("worthLook", true);
    let finish: (value: unknown) => void = () => undefined;
    explainWorthDetail.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<WorthBlock worth={worth} thingId={vase.id} />);
    await userEvent.click(screen.getByRole("button", { name: "Undersök värdet" }));
    expect(explainWorthDetail).toHaveBeenCalledWith(vase.id);
    expect(await screen.findByTestId("worth-explaining")).toHaveTextContent("Funderar");
    expect(screen.queryByRole("button", { name: "Undersök värdet" })).not.toBeInTheDocument();
    finish(ok({ detail: explanationText }));
    const detailBox = await screen.findByTestId("worth-detail");
    expect(within(detailBox).getByRole("heading", { name: "Därför markerades den" })).toBeInTheDocument();
    expect(within(detailBox).getByRole("heading", { name: "Vad det kan vara" })).toBeInTheDocument();
    expect(within(detailBox).getByRole("heading", { name: "Att undersöka vidare" })).toBeInTheDocument();
    expect(within(detailBox).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Titta på undersidan efter en signatur.", "Jämför med sålda annonser."]);
    expect(screen.getByTestId("worth-block")).toHaveTextContent("Ett tips, inte en värdering.");
    expect(screen.queryByRole("button", { name: "Undersök värdet" })).not.toBeInTheDocument();
    expect(explainWorthDetail).toHaveBeenCalledTimes(1);
  });

  it("shows a kept explanation straight away, without asking", () => {
    saveOption("worthLook", true);
    render(<WorthBlock worth={{ ...worth, detail: explanationText }} thingId={vase.id} />);
    expect(screen.getByTestId("worth-detail")).toHaveTextContent("Troligen svensk kristall");
    expect(screen.queryByRole("button", { name: "Undersök värdet" })).not.toBeInTheDocument();
    expect(explainWorthDetail).not.toHaveBeenCalled();
  });

  it("says it did not work and lets the user try again", async () => {
    saveOption("worthLook", true);
    explainWorthDetail.mockResolvedValueOnce(fail("ai_unavailable")).mockResolvedValueOnce(ok({ detail: explanationText }));
    render(<WorthBlock worth={worth} thingId={vase.id} />);
    await userEvent.click(screen.getByRole("button", { name: "Undersök värdet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI-tjänsten svarar inte just nu");
    await userEvent.click(screen.getByRole("button", { name: "Undersök värdet" }));
    expect(await screen.findByTestId("worth-detail")).toHaveTextContent("Troligen svensk kristall");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a text that is not in the labelled shape as it is", () => {
    saveOption("worthLook", true);
    render(<WorthBlock worth={{ ...worth, detail: "Bara en rad." }} thingId={vase.id} />);
    expect(screen.getByTestId("worth-detail")).toHaveTextContent("Bara en rad.");
  });
});
