import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import { allergyDisclaimer } from "../domain/disclaimer";
import type { Menu } from "../domain/types";
import { MenuAdvisor } from "./menu-advisor";

// The journey: off without the Tillval, then start, a live reading, the answer, Ert val, the whole menu and a dish.
// The photo is not decoded here (downscaleImage is mocked) and the route is a mocked fetch.

const downscaleImage = vi.fn<(file: Blob) => Promise<Result<Blob>>>();
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: (file: Blob) => downscaleImage(file) }));

const dish = (patch: Partial<Menu["ratter"][number]>): Menu["ratter"][number] => ({
  originalnamn: "Pollo",
  grupp: "Varmrätt",
  forklaring: "Kyckling.",
  huvudingredienser: [],
  kategori: "kott",
  allergener: [],
  kan_innehalla: [],
  pris: null,
  valuta: "SEK",
  ...patch,
});

const menu: Menu = {
  restaurang: "Taverna Mock",
  sprak: "es",
  osakert: ["Priset på paellan"],
  ratter: [
    dish({ originalnamn: "Pimientos de padrón", grupp: "Förrätt", forklaring: "Små stekta gröna paprikor med flingsalt.", huvudingredienser: ["paprika"], kategori: "vegetariskt", pris: 77 }),
    dish({ originalnamn: "Paella de marisco", forklaring: "Risgryta med skaldjur, saffran och musslor.", huvudingredienser: ["ris", "skaldjur"], kategori: "skaldjur", allergener: ["skaldjur"], pris: 200 }),
    dish({ originalnamn: "Albóndigas", forklaring: "Köttbullar i tomatsås med lök.", allergener: ["gluten"], pris: 100 }),
    dish({ originalnamn: "Tortilla española", forklaring: "Spansk potatisomelett med lök.", kategori: "vegetariskt", allergener: ["agg"], pris: 90 }),
    dish({ originalnamn: "Tarta de Santiago", grupp: "Efterrätt", forklaring: "Spansk mandelkaka.", huvudingredienser: ["mandel"], allergener: ["notter"], pris: 66 }),
    dish({ originalnamn: "Cerveza", grupp: "Drycker", forklaring: "Öl.", kategori: "ej_tillampligt", allergener: ["gluten"], pris: 55 }),
  ],
};

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const reading = (m: Menu = menu, quality = "standard") => answer({ ok: true, data: { menu: m, quality, escalated: false, model: quality === "careful" ? "Sonnet 5.5" : "Haiku 5.5", effort: quality === "careful" ? "medel" : "låg" } });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  saveOption("menuAdvisor", true);
  downscaleImage.mockReset().mockResolvedValue(ok(new Blob(["jpeg"], { type: "image/jpeg" })));
  fetchMock.mockReset().mockImplementation(() => Promise.resolve(reading()));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const user = () => userEvent.setup();
const photoFile = () => new File(["x"], "menu.jpg", { type: "image/jpeg" });

async function readPhoto(u: ReturnType<typeof userEvent.setup>) {
  await u.upload(screen.getByTestId("menu-file"), photoFile());
}

async function toAnswer(u: ReturnType<typeof userEvent.setup>) {
  await readPhoto(u);
  await screen.findByTestId("menu-answer");
}

const savedPeople = {
  v: 1,
  people: [
    { id: "me", name: "Du", kind: "member", allergies: [], tastes: {}, dislikes: [], likes: [], drink: "ol" },
    { id: "a", name: "Anna", kind: "member", allergies: ["notter"], tastes: {}, dislikes: [], likes: ["paprika"], drink: "vin" },
  ],
};

async function withAnna(u: ReturnType<typeof userEvent.setup>) {
  localStorage.setItem("livskoll-menu-people-v1", JSON.stringify(savedPeople));
  render(<MenuAdvisor />);
  await u.click(screen.getByTestId("menu-company-row"));
  await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Anna" }));
  await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Klar" }));
}

describe("the Tillval", () => {
  it("is off by default: the page says so and offers no photo", async () => {
    localStorage.clear();
    render(<MenuAdvisor />);
    expect(await screen.findByText(/Menyrådgivaren är avstängd/)).toBeInTheDocument();
    expect(screen.queryByTestId("menu-photo")).not.toBeInTheDocument();
  });
});

describe("the start", () => {
  it("is a question, a row with who is with, one photo button and a quiet link: no panels, no chips", () => {
    render(<MenuAdvisor />);
    expect(screen.getByRole("heading", { name: "Vad står det på menyn?" })).toBeInTheDocument();
    expect(screen.getByTestId("menu-company-line")).toHaveTextContent("Bara du");
    expect(screen.getByTestId("menu-photo")).toHaveTextContent("Fota menyn");
    expect(screen.getByTestId("menu-explain")).toHaveTextContent("Bara förklara menyn");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nötter/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("menu-disclaimer")).not.toBeInTheDocument();
  });

  it("the first time (nobody has anything filled in) has a row to skip about what you do not eat; it stays away once skipped", async () => {
    const u = user();
    const { unmount } = render(<MenuAdvisor />);
    const row = screen.getByTestId("menu-first-time");
    expect(row).toHaveTextContent("Berätta kort vad ni inte äter");
    await u.click(within(row).getByRole("button", { name: "Hoppa över" }));
    expect(screen.queryByTestId("menu-first-time")).not.toBeInTheDocument();
    unmount();
    render(<MenuAdvisor />);
    expect(screen.queryByTestId("menu-first-time")).not.toBeInTheDocument();
  });

  it("with something filled in there is no first-time row", () => {
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify(savedPeople));
    render(<MenuAdvisor />);
    expect(screen.queryByTestId("menu-first-time")).not.toBeInTheDocument();
  });

  it("the company row opens a sheet: members and guests, a guest with just a name is not saved, Spara gäst keeps one", async () => {
    const u = user();
    render(<MenuAdvisor members={[{ id: "u1", name: "Pontus", isMe: true }, { id: "u2", name: "Martina", isMe: false }]} />);
    await u.click(screen.getByTestId("menu-company-row"));
    const sheet = within(screen.getByRole("dialog", { name: "Vilka är med?" }));
    const group = sheet.getByRole("group", { name: "Sällskap" });
    await u.click(within(group).getByRole("button", { name: "Martina" }));
    await u.click(sheet.getByRole("button", { name: "Lägg till gäst" }));
    await u.type(screen.getByTestId("menu-guest-name"), "Gunnar");
    await u.click(sheet.getByRole("button", { name: /^Lägg till$/ }));
    expect(sheet.getByTestId("menu-company-summary")).toHaveTextContent("Du + Martina + 1 gäst");
    expect(localStorage.getItem("livskoll-menu-people-v1") ?? "").not.toContain("Gunnar");
    await u.click(sheet.getByRole("button", { name: "Klar" }));
    expect(screen.getByTestId("menu-company-line")).toHaveTextContent("Ni är tre · Du, Martina, Gunnar");
  });

  it("keeps a guest when Spara gäst is chosen", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await u.click(screen.getByTestId("menu-company-row"));
    const sheet = within(screen.getByRole("dialog"));
    await u.click(sheet.getByRole("button", { name: "Lägg till gäst" }));
    await u.type(screen.getByTestId("menu-guest-name"), "Greta");
    await u.click(sheet.getByRole("button", { name: "Spara gäst" }));
    await u.click(sheet.getByRole("button", { name: /^Lägg till$/ }));
    expect(localStorage.getItem("livskoll-menu-people-v1")).toContain("Greta");
  });
});

describe("a reading", () => {
  it("sends the photo to the live route with the standard quality, then shows the answer", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/menu/read?stream=1");
    expect((init.body as FormData).get("quality")).toBe("standard");
    expect(screen.getByRole("heading", { name: "Det här passar er" })).toBeInTheDocument();
    expect(screen.getByTestId("menu-reader")).toHaveTextContent("Läst av Haiku 5.5 · låg");
  });

  it("shows the dishes as they come in from the stream and then the answer; the status follows what was found", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    const push = (value: object) => act(async () => void controller.enqueue(new TextEncoder().encode(`${JSON.stringify(value)}\n`)));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    expect(await screen.findByTestId("menu-reading-status")).toHaveTextContent("Läser menyn…");
    await push({ type: "reading", quality: "standard", restart: false, model: "Haiku 5.5", effort: "låg" });
    expect(screen.getByTestId("menu-reader")).toHaveTextContent("Läst av Haiku 5.5 · låg");
    await push({ type: "language", sprak: "es" });
    expect(screen.getByTestId("menu-reading-status")).toHaveTextContent("Översätter från spanska…");
    await push({ type: "dish", index: 0, dish: menu.ratter[0] });
    await push({ type: "dish", index: 1, dish: menu.ratter[1] });
    expect(screen.getByTestId("menu-reading-status")).toHaveTextContent("Hittade 2 rätter");
    const list = within(screen.getByTestId("menu-reading-dishes")).getAllByRole("listitem");
    expect(list.map((item) => item.textContent)).toEqual(["Pimientos de padrón77 kr", "Paella de marisco200 kr"]);
    // The server redoes it as careful: the list starts over.
    await push({ type: "reading", quality: "careful", restart: true, model: "Sonnet 5.5", effort: "medel" });
    expect(screen.queryByTestId("menu-reading-dishes")).not.toBeInTheDocument();
    await push({ type: "done", menu, quality: "careful", escalated: true, model: "Sonnet 5.5", effort: "medel" });
    await act(async () => controller.close());
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    expect(screen.getByTestId("menu-reader")).toHaveTextContent("Läst av Sonnet 5.5 · medel");
  });

  it("falls back to the plain route when the stream cannot be used", async () => {
    fetchMock.mockImplementation((url) => (url.includes("stream=1") ? Promise.reject(new TypeError("network")) : Promise.resolve(reading())));
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/menu/read?stream=1", "/api/menu/read"]);
  });

  it("does not pay twice for a reading that started and then failed", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: "reading", quality: "standard", restart: false, model: "Haiku 5.5", effort: "låg" })}\n${JSON.stringify({ type: "error", code: "ai_unavailable" })}\n`));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att läsa menyn just nu. Försök igen.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the reason right under the question when the reading fails", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(answer({ ok: false, error: { code: "ai_cap_reached" } })));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    expect(await screen.findByRole("alert")).toHaveTextContent("Dagens AI-tak är nått");
    expect(screen.getByTestId("menu-photo")).toBeInTheDocument();
    // Under the question and above the company row: seen without scrolling.
    expect(screen.getByRole("alert").compareDocumentPosition(screen.getByTestId("menu-company-row")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("stops with Avbryt and shows no error", async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    await u.click(await screen.findByRole("button", { name: "Avbryt" }));
    expect(await screen.findByTestId("menu-photo")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fails with the photo's own error when it cannot be decoded", async () => {
    downscaleImage.mockResolvedValue(fail("image_unsupported"));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says plainly when nothing could be read, with tips for a better photo", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reading({ ...menu, ratter: [], osakert: [] })));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    const empty = await screen.findByTestId("menu-empty");
    expect(empty).toHaveTextContent("Jag kunde inte läsa menyn");
    expect(empty).toHaveTextContent("Håll kameran rakt framför menyn");
    expect(empty).toHaveTextContent("Undvik blänk");
  });

  it("reads again with quality careful from the same photo, and then offers no more", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => void (release = () => resolve(reading(menu, "careful")))));
    await u.click(screen.getByRole("button", { name: "Läs noggrannare" }));
    expect(screen.getByText("Det här tar längre tid, upp till ett par minuter.")).toBeInTheDocument();
    await act(async () => release());
    await screen.findByTestId("menu-answer");
    expect((fetchMock.mock.calls[1][1].body as FormData).get("quality")).toBe("careful");
    expect(screen.queryByRole("button", { name: "Läs noggrannare" })).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-reader")).toHaveTextContent("Läst av Sonnet 5.5 · medel");
    expect(downscaleImage).toHaveBeenCalledTimes(1);
  });

  it("stopping a careful reading goes back to the answer it came from", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))));
    await u.click(screen.getByRole("button", { name: "Läs noggrannare" }));
    await u.click(await screen.findByRole("button", { name: "Avbryt" }));
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
  });
});

describe("the answer", () => {
  it("alone and without preferences: three cards for the person, the best chosen, no marks, and a line that allergens are not filtered", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    const mine = screen.getByRole("radiogroup", { name: "Rätt åt Du" });
    const cards = within(mine).getAllByRole("radio");
    expect(cards).toHaveLength(3);
    expect(cards.filter((card) => (card as HTMLInputElement).checked)).toHaveLength(1);
    expect(document.querySelector("[data-tone='mint'], [data-tone='sand'], [data-tone='danger']")).toBeNull();
    expect(screen.getByTestId("menu-unfiltered")).toHaveTextContent("Allergener är inte filtrerade");
    // The dish is explained under its name.
    expect(screen.getByText("Risgryta med skaldjur, saffran och musslor.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se hela menyn" })).toBeInTheDocument();
    expect(screen.queryByText(/Skicka till sällskapet/)).not.toBeInTheDocument();
  });

  it("with company: a group per person, only the reasons that change something, and one tap changes the choice and the total", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    const groups = screen.getAllByTestId("menu-person");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Du", "Anna"]);
    expect(within(groups[0]).getByText("med öl")).toBeInTheDocument();
    expect(within(groups[1]).getByText("med vin")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-unfiltered")).not.toBeInTheDocument();
    // Anna's nut allergy: the tarta is a dessert and not offered; nothing is red.
    expect(document.querySelector("[data-tone='danger']")).toBeNull();
    const total = screen.getByTestId("menu-total").textContent;
    const other = within(groups[1]).getAllByRole("radio").find((radio) => !(radio as HTMLInputElement).checked)!;
    await u.click(other);
    expect(other).toBeChecked();
    expect(screen.getByTestId("menu-total").textContent).not.toBe(total);
    expect(within(groups[1]).getAllByRole("radio").filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);
  });

  it("a dish with an allergen of the person, offered when nothing else fits, is red with its reason", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reading({ ...menu, ratter: [dish({ originalnamn: "Ensalada", forklaring: "Sallad med nötdressing.", allergener: ["notter"], pris: 77 })] })));
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify({ v: 1, people: [{ ...savedPeople.people[0], allergies: ["notter"] }] }));
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    const red = document.querySelector("[data-tone='danger']");
    expect(red).toHaveTextContent("Inget annat på menyn passar. Den här innehåller en allergen du har, fråga personalen.");
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });

  it("Klart shows Ert val: the name as printed, the description, the drink, the allergy line and the total; Ändra goes back", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await u.click(screen.getByRole("button", { name: "Klart" }));
    const choice = screen.getByTestId("menu-choice");
    expect(within(choice).getAllByTestId("menu-choice-person")).toHaveLength(2);
    expect(within(choice).getByTestId("menu-allergy-line")).toHaveTextContent("Anna: nötter.");
    expect(within(choice).getByTestId("menu-disclaimer")).toHaveTextContent(allergyDisclaimer);
    expect(screen.queryByText(/Skicka till sällskapet/)).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Ändra" }));
    expect(screen.getByTestId("menu-answer")).toBeInTheDocument();
  });

  it("the drink can be changed in Ert val, and the total follows", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    await u.click(screen.getByRole("button", { name: "Klart" }));
    const total = screen.getByTestId("menu-total").textContent;
    await u.click(screen.getByTestId("menu-drink-button"));
    const sheet = within(screen.getByRole("dialog", { name: "Dryck åt Du" }));
    // The menu's own price for beer (55) comes before the estimate.
    expect(sheet.getByRole("radio", { name: /Öl/ }).closest("label")).toHaveTextContent("55 kr");
    expect(sheet.getByRole("radio", { name: /Cocktail/ }).closest("label")).toHaveTextContent("ca 140 kr");
    await u.click(sheet.getByRole("radio", { name: /Cocktail/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("menu-choice-person")).toHaveTextContent("Cocktail");
    expect(screen.getByTestId("menu-total").textContent).not.toBe(total);
    expect(screen.getByTestId("menu-total")).toHaveTextContent(/ca \d+ kr/);
  });

  it("Klart in Ert val ends the journey at the start", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    await u.click(screen.getByRole("button", { name: "Klart" }));
    await u.click(screen.getByRole("button", { name: "Klart" }));
    expect(screen.getByRole("heading", { name: "Vad står det på menyn?" })).toBeInTheDocument();
  });
});

describe("the whole menu and a dish", () => {
  it("groups the dishes with name, price and explanation, searches, and marks a dish someone cannot eat with a red dot and the name", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await u.click(screen.getByRole("button", { name: "Se hela menyn" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Förrätt", "Varmrätt", "Efterrätt", "Drycker"]);
    expect(screen.getByTestId("menu-unfit")).toHaveTextContent("Anna");
    expect(screen.getAllByTestId("menu-dish")).toHaveLength(6);
    expect(screen.getByText("77 kr")).toBeInTheDocument();
    await u.type(screen.getByRole("searchbox", { name: "Sök rätt" }), "tarta");
    expect(screen.getAllByTestId("menu-dish")).toHaveLength(1);
    expect(screen.getByTestId("menu-uncertain")).toHaveTextContent("Priset på paellan");
  });

  it("a dish opens in a sheet: what it is, what is in it, who it suits, and Lägg till åt adds it for the person and goes back", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await u.click(screen.getByRole("button", { name: "Se hela menyn" }));
    await u.type(screen.getByRole("searchbox", { name: "Sök rätt" }), "tarta");
    await u.click(screen.getByTestId("menu-dish"));
    const sheet = within(screen.getByRole("dialog", { name: "Tarta de Santiago" }));
    expect(sheet.getByText("Spansk mandelkaka.")).toBeInTheDocument();
    expect(sheet.getByText("mandel")).toBeInTheDocument();
    expect(sheet.getByTestId("menu-dish-fit")).toHaveTextContent("Passar Du. Anna kan inte (nötter).");
    expect(sheet.getByText(allergyDisclaimer)).toBeInTheDocument();
    await u.click(sheet.getByRole("radio", { name: "Anna" }));
    await u.click(sheet.getByRole("button", { name: "Lägg till åt Anna" }));
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    // Never silent: the dish she cannot eat is shown red with the reason.
    expect(document.querySelector("[data-tone='danger']")).toHaveTextContent("Innehåller nötter. Fråga personalen.");
    expect(within(screen.getByRole("radiogroup", { name: "Rätt åt Anna" })).getByRole("radio", { name: /Tarta de Santiago/ })).toBeChecked();
  });

  it("'Fler rätter åt Anna' opens the menu with Anna already chosen", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await u.click(screen.getByRole("button", { name: "Fler rätter åt Anna" }));
    expect(screen.getByText("Välj en rätt att lägga till åt Anna")).toBeInTheDocument();
    await u.type(screen.getByRole("searchbox", { name: "Sök rätt" }), "tortilla");
    await u.click(screen.getByTestId("menu-dish"));
    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.queryByRole("radiogroup", { name: "Lägg till åt" })).not.toBeInTheDocument();
    await u.click(sheet.getByRole("button", { name: "Lägg till åt Anna" }));
    expect(within(screen.getByRole("radiogroup", { name: "Rätt åt Anna" })).getByRole("radio", { name: /Tortilla/ })).toBeChecked();
  });

  it("Bara förklara menyn: the reading ends in the whole menu with no advice and no marks on people", async () => {
    const u = user();
    await withAnna(u);
    await u.click(screen.getByTestId("menu-explain"));
    await readPhoto(u);
    await screen.findByTestId("menu-full");
    expect(screen.queryByTestId("menu-answer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("menu-unfit")).not.toBeInTheDocument();
    await u.click(screen.getAllByTestId("menu-dish")[0]);
    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.queryByTestId("menu-dish-fit")).not.toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: /Lägg till åt/ })).not.toBeInTheDocument();
  });

  it("Ikväll: a dish is added in its sheet, the sum counts the priced ones, and the list clears", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await u.click(screen.getByTestId("menu-explain"));
    await readPhoto(u);
    await screen.findByTestId("menu-full");
    for (const name of ["Pimientos de padrón", "Paella de marisco"]) {
      await u.click(screen.getByRole("button", { name: new RegExp(name) }));
      await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Lägg till Ikväll" }));
      await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Klar" }));
    }
    await u.click(screen.getByTestId("menu-tonight-open"));
    const list = screen.getByTestId("menu-tonight");
    expect(within(list).getAllByTestId("menu-tonight-row")).toHaveLength(2);
    expect(screen.getByTestId("menu-tonight-total")).toHaveTextContent("Totalt ca 277 kr");
    await u.click(screen.getByRole("button", { name: "Rensa listan" }));
    expect(screen.getByText("Inga rätter valda än")).toBeInTheDocument();
  });
});
