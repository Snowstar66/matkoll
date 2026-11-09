import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import { allergyDisclaimer } from "../domain/disclaimer";
import type { Menu } from "../domain/types";
import { MenuAdvisor } from "./menu-advisor";

// The page: off without the Tillval, then photo, reading, result, filters and Ikväll. The photo is not decoded here
// (downscaleImage is mocked) and the route is a mocked fetch.

const downscaleImage = vi.fn<(file: Blob) => Promise<Result<Blob>>>();
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: (file: Blob) => downscaleImage(file) }));

const menu: Menu = {
  restaurang: "Taverna Mock",
  sprak: "es",
  osakert: ["Priset på paellan"],
  ratter: [
    { originalnamn: "Pulpo a la gallega", grupp: "Förrätt", forklaring: "Kokt bläckfisk.", huvudingredienser: ["bläckfisk"], kategori: "skaldjur", allergener: ["skaldjur"], kan_innehalla: [], pris: 17.95, valuta: "EUR" },
    { originalnamn: "Paella de verduras", grupp: "Varmrätt", forklaring: "Risrätt med grönsaker.", huvudingredienser: ["ris"], kategori: "vegetariskt", allergener: [], kan_innehalla: ["notter"], pris: 15, valuta: "EUR" },
    { originalnamn: "Agua", grupp: "Drycker", forklaring: "Vatten.", huvudingredienser: [], kategori: "ej_tillampligt", allergener: [], kan_innehalla: [], pris: null, valuta: null },
  ],
};

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  saveOption("menuAdvisor", true);
  downscaleImage.mockReset().mockResolvedValue(ok(new Blob(["jpeg"], { type: "image/jpeg" })));
  fetchMock.mockReset().mockResolvedValue(answer({ ok: true, data: { menu, quality: "standard", escalated: false } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function readPhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByTestId("menu-file"), new File(["x"], "menu.jpg", { type: "image/jpeg" }));
  await screen.findByTestId("menu-result");
}

describe("the Tillval", () => {
  it("is off by default: the page says so and offers no photo", async () => {
    localStorage.clear();
    render(<MenuAdvisor />);
    expect(await screen.findByText(/Menyrådgivaren är avstängd/)).toBeInTheDocument();
    expect(screen.queryByTestId("menu-photo")).not.toBeInTheDocument();
  });
});

describe("a reading", () => {
  it("sends the photo with the standard quality and shows the dishes in groups with prices in the menu's currency and kronor", async () => {
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    expect(screen.getByTestId("menu-disclaimer")).toHaveTextContent(allergyDisclaimer);
    await readPhoto(user);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/menu/read");
    expect((init.body as FormData).get("quality")).toBe("standard");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Förrätt", "Varmrätt", "Drycker", "Förslag till sällskapet"]);
    expect(screen.getByText("17,95 € · ca 197 kr")).toBeInTheDocument();
    expect(screen.getByText(/Läste: spanska · 3 rätter · priser i €/)).toBeInTheDocument();
    expect(screen.getByTestId("menu-uncertain")).toHaveTextContent("Priset på paellan");
    expect(screen.getByTestId("menu-disclaimer")).toHaveTextContent(allergyDisclaimer);
  });

  it("marks what you avoid, 'may contain' too, and marks nothing as safe; Bara förklara marks no one", async () => {
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await user.click(screen.getByRole("button", { name: /Nötter/ }));
    await user.type(screen.getByTestId("menu-dislikes"), "bläckfisk");
    await readPhoto(user);
    const rows = screen.getAllByTestId("menu-dish");
    expect(rows[0]).toHaveAttribute("data-flagged", "true");
    expect(rows[0]).toHaveTextContent("Du undviker: bläckfisk");
    expect(rows[1]).toHaveTextContent("Kan innehålla nötter");
    expect(rows[2]).not.toHaveAttribute("data-flagged");
    expect(screen.queryByText(/\bsäker\b/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Bara förklara" }));
    expect(screen.queryByText("Kan innehålla nötter")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nötter/ })).not.toBeInTheDocument();
  });

  it("filters by search text and Vegetariskt", async () => {
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await readPhoto(user);
    await user.click(screen.getByRole("button", { name: "Vegetariskt" }));
    expect(screen.getAllByTestId("menu-dish")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Vegetariskt" }));
    await user.type(screen.getByRole("searchbox", { name: "Sök i menyn" }), "agua");
    expect(screen.getAllByTestId("menu-dish")).toHaveLength(1);
  });

  it("reads again with quality careful from the same photo, and then offers no more", async () => {
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await readPhoto(user);
    expect(screen.getByText("Tar längre tid och kostar lite mer.")).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(answer({ ok: true, data: { menu, quality: "careful", escalated: false } }));
    await user.click(screen.getByRole("button", { name: "Läs noggrannare" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1][1].body as FormData).get("quality")).toBe("careful");
    await screen.findByTestId("menu-result");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Läs noggrannare" })).not.toBeInTheDocument());
    expect(downscaleImage).toHaveBeenCalledTimes(1);
  });

  it("says plainly when nothing could be read, with tips for a better photo", async () => {
    fetchMock.mockResolvedValue(answer({ ok: true, data: { menu: { ...menu, ratter: [], osakert: [] }, quality: "standard", escalated: false } }));
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await user.upload(screen.getByTestId("menu-file"), new File(["x"], "menu.jpg", { type: "image/jpeg" }));
    const empty = await screen.findByTestId("menu-empty");
    expect(empty).toHaveTextContent("Jag kunde inte läsa menyn");
    expect(empty).toHaveTextContent("Håll kameran rakt framför menyn");
    expect(empty).toHaveTextContent("Undvik blänk");
  });

  it("shows the reason when the reading fails, and goes back to the start", async () => {
    fetchMock.mockResolvedValue(answer({ ok: false, error: { code: "ai_cap_reached" } }));
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await user.upload(screen.getByTestId("menu-file"), new File(["x"], "menu.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dagens AI-tak är nått");
    expect(screen.getByTestId("menu-photo")).toBeInTheDocument();
  });

  it("stops with Avbryt and shows no error", async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))));
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await user.upload(screen.getByTestId("menu-file"), new File(["x"], "menu.jpg", { type: "image/jpeg" }));
    await user.click(await screen.findByRole("button", { name: "Avbryt" }));
    expect(await screen.findByTestId("menu-photo")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fails with the photo's own error when it cannot be decoded", async () => {
    downscaleImage.mockResolvedValue(fail("image_unsupported"));
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await user.upload(screen.getByTestId("menu-file"), new File(["x"], "menu.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Ikväll", () => {
  it("collects starred dishes with the sum in kronor, and clears", async () => {
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await readPhoto(user);
    await user.click(screen.getByRole("button", { name: "Stjärnmärk Pulpo a la gallega" }));
    await user.click(screen.getByRole("button", { name: "Stjärnmärk Paella de verduras" }));
    await user.click(screen.getByRole("button", { name: "Stjärnmärk Agua" }));
    await user.click(screen.getByTestId("menu-tonight-open"));
    const list = screen.getByTestId("menu-tonight");
    expect(within(list).getAllByTestId("menu-tonight-row")).toHaveLength(3);
    // 17,95 € is about 197 kr and 15 € about 165 kr; the drink has no price.
    expect(screen.getByTestId("menu-tonight-total")).toHaveTextContent("Totalt ca 362 kr");
    expect(screen.getByTestId("menu-tonight-total")).toHaveTextContent("1 rätt saknar pris");
    await user.click(screen.getByRole("button", { name: "Rensa listan" }));
    expect(screen.getByText("Inga rätter valda än")).toBeInTheDocument();
  });
});

describe("Sällskap", () => {
  const people = {
    v: 1,
    people: [
      { id: "me", name: "Du", kind: "member", allergies: [], tastes: {}, drink: null },
      { id: "a", name: "Anna", kind: "member", allergies: ["notter"], tastes: {}, drink: null },
    ],
  };

  it("says who is with, adds a guest with just a name that is not saved, and marks dishes that do not suit someone", async () => {
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify(people));
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    const company = screen.getByTestId("menu-company");
    expect(within(company).getByTestId("menu-company-summary")).toHaveTextContent("Du");
    await user.click(within(company).getByRole("button", { name: "Anna" }));
    await user.click(within(company).getByRole("button", { name: "Lägg till gäst" }));
    await user.type(screen.getByTestId("menu-guest-name"), "Gunnar");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(screen.getByTestId("menu-company-summary")).toHaveTextContent("Du + Anna + 1 gäst");
    // A guest that is not kept is not in storage.
    expect(localStorage.getItem("livskoll-menu-people-v1")).not.toContain("Gunnar");

    await readPhoto(user);
    const rows = screen.getAllByTestId("menu-dish");
    expect(rows[1]).toHaveTextContent("Passar inte Anna (nötter)");
    expect(rows[0]).not.toHaveTextContent("Passar inte");
    await user.click(screen.getByRole("radio", { name: "Bara förklara" }));
    expect(screen.queryByText(/Passar inte/)).not.toBeInTheDocument();
  });

  it("suggests for the company in Hjälp mig välja and shares the text through the clipboard when Web Share is missing", async () => {
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify(people));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    render(<MenuAdvisor />);
    await user.click(screen.getByRole("button", { name: "Anna" }));
    await readPhoto(user);
    const suggestions = screen.getByTestId("menu-suggestions");
    expect(suggestions).toHaveTextContent("Anna:");
    await user.click(within(suggestions).getByRole("button", { name: "Skicka till sällskapet" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Kopierat/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Bara förklara" }));
    expect(screen.queryByTestId("menu-suggestions")).not.toBeInTheDocument();
  });

  it("keeps a guest when Spara gäst is chosen", async () => {
    const user = userEvent.setup();
    render(<MenuAdvisor />);
    await user.click(screen.getByRole("button", { name: "Lägg till gäst" }));
    await user.type(screen.getByTestId("menu-guest-name"), "Greta");
    await user.click(screen.getByRole("button", { name: "Spara gäst" }));
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(localStorage.getItem("livskoll-menu-people-v1")).toContain("Greta");
    expect(screen.getByTestId("menu-company-summary")).toHaveTextContent("Du + 1 gäst");
  });

  it("offers the household's members as company straight away", async () => {
    render(<MenuAdvisor members={[{ id: "u1", name: "Pontus", isMe: true }, { id: "u2", name: "Martina", isMe: false }]} />);
    const group = await screen.findByRole("group", { name: "Sällskap" });
    expect(within(group).getByRole("button", { name: "Martina" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Du" })).toBeInTheDocument();
  });
});
