import { act, render, screen, waitFor, within } from "@testing-library/react";
import type { BoundFunctions, queries } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import { allergyDisclaimer } from "../domain/disclaimer";
import type { Menu } from "../domain/types";
import { forgetExplanations } from "./dish-more";
import { MenuAdvisor } from "./menu-advisor";

// The journey: off without the Tillval, then start, a live reading, the answer, Ert val, the whole menu and a dish.
// The photo is not decoded here (downscaleImage is mocked) and the route is a mocked fetch.

const readMenuText = vi.fn();
vi.mock("../actions/read-menu-text", () => ({ readMenuText: (input: unknown) => readMenuText(input) }));

const explainDish = vi.fn();
vi.mock("../actions/explain-dish", () => ({ explainDish: (input: unknown) => explainDish(input) }));

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
  readMenuText.mockReset();
  fetchMock.mockReset().mockImplementation(() => Promise.resolve(reading()));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

type Scope = BoundFunctions<typeof queries>;

/** The row (the card with its soptunna) of the dish that is chosen for the person. */
const chosenRow = (card: Scope) => card.getByRole("radio", { checked: true }).closest<HTMLElement>("[data-testid=menu-proposal-row]")!;
const names = (card: Scope) => card.getAllByRole("radio").map((radio) => radio.closest("label")!.querySelector(".font-bold")!.textContent);

const user = () => userEvent.setup();
const photoFile = () => new File(["x"], "menu.jpg", { type: "image/jpeg" });

/** A photo only adds a page: "Läs menyn" starts the reading. */
async function readPhoto(u: ReturnType<typeof userEvent.setup>) {
  await u.upload(screen.getByTestId("menu-file"), photoFile());
  await u.click(await screen.findByRole("button", { name: "Läs menyn" }));
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
  await u.click(screen.getByRole("checkbox", { name: "Anna" }));
}

/** The quiet link "Hela menyn" under the answer; the whole menu is also reached from "Lägg till rätt". */
const openFullMenu = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole("button", { name: "Hela menyn" }));
/** The back link of the whole menu. */
const backToAnswer = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole("button", { name: "Förslag" }));

describe("the Tillval", () => {
  it("is off by default: the page says so and offers no photo", async () => {
    localStorage.clear();
    render(<MenuAdvisor />);
    expect(await screen.findByText(/Menyrådgivaren är avstängd/)).toBeInTheDocument();
    expect(screen.queryByTestId("menu-photo")).not.toBeInTheDocument();
  });
});

describe("the start", () => {
  it("is the title, one sentence, who eats as rows straight on the page, and one photo button: no sheet, no cards, no second way to the camera", () => {
    render(<MenuAdvisor />);
    expect(screen.getByRole("heading", { name: "Tolka menyn", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Fota menyn, så förklarar jag rätterna och föreslår något åt var och en.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Matsedel" })).toHaveAttribute("href", "/matsedel");
    expect(screen.getByRole("heading", { name: "Vilka äter?" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Du" })).toBeChecked();
    expect(screen.getByTestId("menu-company")).toHaveTextContent("Inga allergier angivna");
    expect(screen.getByTestId("menu-photo")).toHaveTextContent("Fota menyn");
    expect(screen.getByRole("link", { name: /Smak och allergier/ })).toBeInTheDocument();
    expect(screen.queryByText("Bara förklara menyn")).not.toBeInTheDocument();
    expect(screen.queryByText(/Berätta kort vad ni inte äter/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("menu-disclaimer")).not.toBeInTheDocument();
  });

  it("each row shows the person's allergies, and a tap on the row ticks and unticks", async () => {
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify({ v: 1, people: [savedPeople.people[0], { ...savedPeople.people[1], allergies: ["gluten", "notter"] }] }));
    const u = user();
    render(<MenuAdvisor />);
    const rows = screen.getAllByTestId("menu-company-person");
    expect(rows.map((row) => row.textContent)).toEqual(["DDuInga allergier angivna", "AAnnaGluten, nötter"]);
    const anna = screen.getByRole("checkbox", { name: "Anna" });
    expect(anna).not.toBeChecked();
    await u.click(rows[1]!);
    expect(anna).toBeChecked();
    await u.click(rows[1]!);
    expect(anna).not.toBeChecked();
    // Never nobody: with Du unticked too, Du is with.
    await u.click(screen.getByRole("checkbox", { name: "Du" }));
    expect(screen.getByRole("checkbox", { name: "Du" })).toBeChecked();
  });

  it("whoever was ticked last time is ticked again on this phone", async () => {
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify(savedPeople));
    const u = user();
    const { unmount } = render(<MenuAdvisor />);
    await u.click(screen.getByRole("checkbox", { name: "Anna" }));
    expect(JSON.parse(localStorage.getItem("livskoll-menu-company-v1") ?? "[]")).toEqual(["me", "a"]);
    unmount();
    render(<MenuAdvisor />);
    expect(screen.getByRole("checkbox", { name: "Anna" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Du" })).toBeChecked();
  });

  it("someone who is gone since last time is simply not ticked; with nobody left it starts on Du", () => {
    localStorage.setItem("livskoll-menu-company-v1", JSON.stringify(["p-gone"]));
    render(<MenuAdvisor />);
    expect(screen.getByRole("checkbox", { name: "Du" })).toBeChecked();
  });

  it("Lägg till person is a link to Medlemmar, Utan konto; a person added there is on the list, not ticked", () => {
    const people = { v: 1, people: [...savedPeople.people, { id: "p-greta", name: "Greta", kind: "guest", allergies: ["notter"], tastes: {}, drink: null }] };
    const first = render(<MenuAdvisor />);
    expect(screen.getByRole("link", { name: "Lägg till person" })).toHaveAttribute("href", "/installningar/medlemmar#utan-konto");
    expect(screen.queryByRole("button", { name: "Lägg till gäst" })).not.toBeInTheDocument();
    first.unmount();
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify(people));
    render(<MenuAdvisor />);
    expect(screen.getByRole("checkbox", { name: "Greta" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Du" })).toBeChecked();
    expect(screen.queryByText(/bara ikväll/)).not.toBeInTheDocument();
  });

  it("from five people four rows show, and the ticked ones, with Visa alla", async () => {
    const people = ["Anna", "Bo", "Cia", "Dan", "Eva"].map((name) => ({ id: `p-${name}`, name, kind: "guest", allergies: [], tastes: {}, drink: null }));
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify({ v: 1, people: [savedPeople.people[0], ...people] }));
    localStorage.setItem("livskoll-menu-company-v1", JSON.stringify(["me", "p-Eva"]));
    const u = user();
    render(<MenuAdvisor />);
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual(["Du", "Anna", "Bo", "Cia", "Eva"]);
    await u.click(screen.getByRole("button", { name: "Visa alla (6)" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
  });

  it("shows what the route layer puts under the photo button", () => {
    render(<MenuAdvisor startSlot={<button type="button">Inte på plats än? Sök restauranger</button>} />);
    const link = screen.getByRole("button", { name: "Inte på plats än? Sök restauranger" });
    expect(screen.getByTestId("menu-photo").compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    const stop = await screen.findByTestId("menu-stop");
    expect(stop).toHaveAttribute("data-kind", "error");
    expect(within(stop).getByRole("heading", { name: "Det gick inte just nu" })).toBeInTheDocument();
    expect(stop).toHaveTextContent("Menyn kunde inte läsas. Kontrollera nätet och försök igen. Fotot finns kvar.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /** A live reading that sends `count` dishes of the menu and then fails. */
  const failingStream = (count: number, code = "ai_unavailable") =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const lines = [
            { type: "reading", quality: "standard", restart: false, model: "Haiku 5.5", effort: "låg" },
            { type: "language", sprak: "es" },
            ...menu.ratter.slice(0, count).map((entry, index) => ({ type: "dish", index, dish: entry })),
            { type: "error", code },
          ];
          controller.enqueue(new TextEncoder().encode(lines.map((line) => `${JSON.stringify(line)}\n`).join("")));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "application/x-ndjson" } },
    );

  it("keeps the dishes that came when the reading stops late: the answer with a notice, not a stop", async () => {
    fetchMock.mockResolvedValueOnce(failingStream(4));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-stop")).toBeNull();
    expect(screen.getByText("Läsningen avbröts efter 4 rätter, så några rätter kan saknas.")).toBeInTheDocument();
    expect(screen.getByTestId("menu-reader")).toHaveTextContent("Läst av Haiku 5.5 · låg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is still a stop when too few dishes came, and for a daily cap", async () => {
    fetchMock.mockResolvedValueOnce(failingStream(2));
    const u = user();
    const { unmount } = render(<MenuAdvisor />);
    await readPhoto(u);
    expect(await screen.findByTestId("menu-stop")).toHaveAttribute("data-kind", "error");
    unmount();
    fetchMock.mockResolvedValueOnce(failingStream(5, "ai_cap_reached"));
    render(<MenuAdvisor />);
    await readPhoto(u);
    expect(await screen.findByTestId("menu-stop")).toHaveAttribute("data-kind", "cap");
  });

  it("Läs om reads the same photo again and takes the notice away when the whole menu comes", async () => {
    fetchMock.mockResolvedValueOnce(failingStream(4));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    fetchMock.mockImplementationOnce(() => Promise.resolve(reading()));
    await u.click(screen.getByTestId("menu-read-again"));
    await waitFor(() => expect(screen.queryByText(/Läsningen avbröts/)).toBeNull());
    expect(screen.getByTestId("menu-answer")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("Försök igen on the stop reads the same photo once more, without asking for a new one", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(answer({ ok: false, error: { code: "ai_unavailable" } })));
    fetchMock.mockImplementationOnce(() => Promise.resolve(answer({ ok: false, error: { code: "ai_unavailable" } })));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    await screen.findByTestId("menu-stop");
    expect(screen.getByRole("button", { name: "Fota om" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    expect(downscaleImage).toHaveBeenCalledTimes(1);
  });

  it("the AI cap is a stop of its own: no green button, Tillbaka to the start, and Höj taket only for the app's owner", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(answer({ ok: false, error: { code: "ai_cap_reached" } })));
    const u = user();
    const { unmount } = render(<MenuAdvisor />);
    await readPhoto(u);
    const stop = await screen.findByTestId("menu-stop");
    expect(stop).toHaveAttribute("data-kind", "cap");
    expect(within(stop).getByRole("heading", { name: "Dagens AI-tak är nått" })).toBeInTheDocument();
    expect(stop).toHaveTextContent("Hushållet har använt dagens AI-pengar. Det nollställs i natt.");
    expect(within(stop).queryByRole("link", { name: "Höj taket" })).not.toBeInTheDocument();
    await u.click(within(stop).getByRole("button", { name: "Tillbaka" }));
    expect(screen.getByTestId("menu-start")).toBeInTheDocument();
    unmount();
    render(<MenuAdvisor canRaiseCap />);
    await readPhoto(u);
    expect(await screen.findByRole("link", { name: "Höj taket" })).toHaveAttribute("href", "/installningar/ai-kostnad");
    await u.click(screen.getByRole("button", { name: "Tolka menyn" }));
    expect(screen.getByTestId("menu-start")).toBeInTheDocument();
  });

  it("stops with Avbryt and shows no error", async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    await u.click(await screen.findByRole("button", { name: "Avbryt" }));
    // Back to the pages it was started from, with the photo still there.
    expect(await screen.findByTestId("menu-pages")).toBeInTheDocument();
    expect(screen.getAllByTestId("menu-page")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a photo that cannot be decoded is a page with its own error and Ta om; nothing is read", async () => {
    downscaleImage.mockResolvedValue(fail("image_unsupported"));
    const u = user();
    render(<MenuAdvisor />);
    await u.upload(screen.getByTestId("menu-file"), photoFile());
    const page = await screen.findByTestId("menu-page");
    await waitFor(() => expect(page).toHaveAttribute("data-status", "trouble"));
    expect(page).toHaveTextContent(errorMessages.image_unsupported);
    expect(within(page).getByRole("button", { name: "Ta om sida 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Läs menyn" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says plainly when nothing could be read, with tips for a better photo, and goes back to Tolka menyn", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reading({ ...menu, ratter: [], osakert: [] })));
    const u = user();
    render(<MenuAdvisor />);
    await readPhoto(u);
    const empty = await screen.findByTestId("menu-empty");
    expect(within(empty).getByRole("heading", { name: "Jag kunde inte läsa menyn", level: 1 })).toBeInTheDocument();
    expect(empty).toHaveTextContent("Det gick inte att hitta några rätter på fotot.");
    expect(empty).toHaveTextContent("Håll kameran rakt framför menyn");
    expect(empty).toHaveTextContent("Undvik blänk");
    await u.click(within(empty).getByRole("button", { name: "Tolka menyn" }));
    expect(screen.getByTestId("menu-start")).toBeInTheDocument();
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

describe("the pages of a menu", () => {
  // Each photo's bytes say which file it was, so the order sent can be read back.
  beforeEach(() => {
    downscaleImage.mockImplementation(async (file) => ok(new Blob([(file as File).name], { type: "image/jpeg" })));
  });
  const files = (...names: string[]) => names.map((name) => new File(["x"], name, { type: "image/jpeg" }));
  const sentNames = async (call: number) => Promise.all(((fetchMock.mock.calls[call]![1].body as FormData).getAll("image") as Blob[]).map((blob) => blob.text()));
  const labels = () => screen.getAllByTestId("menu-page-label").map((label) => label.textContent);

  it("a photo only adds a page: nothing is read until Läs menyn, which sends every page in order in one call", async () => {
    const u = user();
    render(<MenuAdvisor costText={(pages) => `Kostar ca 0,01 kr för ${pages} sidor`} />);
    await u.upload(screen.getByTestId("menu-file"), files("a.jpg"));
    expect(await screen.findByRole("heading", { name: "Menyns sidor", level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Läs menyn" })).toBeEnabled());
    expect(labels()).toEqual(["Sida 1 av 1"]);
    expect(screen.getByRole("img", { name: "Sida 1" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("menu-add-page")).toHaveTextContent("Lägg till sida");
    // The next pages: Lägg till sida opens the same input; two at once from the album.
    await u.click(screen.getByTestId("menu-add-page"));
    await u.upload(screen.getByTestId("menu-file"), files("b.jpg", "c.jpg"));
    await waitFor(() => expect(labels()).toEqual(["Sida 1 av 3", "Sida 2 av 3", "Sida 3 av 3"]));
    await waitFor(() => expect(screen.getByTestId("menu-pages-cost")).toHaveTextContent("Kostar ca 0,01 kr för 3 sidor"));
    expect(fetchMock).not.toHaveBeenCalled();
    // Move the last page first, then remove the (now) second.
    await u.click(screen.getByRole("button", { name: "Flytta sida 3 bakåt" }));
    await u.click(screen.getByRole("button", { name: "Flytta sida 2 bakåt" }));
    expect(screen.getByRole("button", { name: "Flytta sida 1 bakåt" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Ta bort sida 2" }));
    expect(labels()).toEqual(["Sida 1 av 2", "Sida 2 av 2"]);
    await u.click(screen.getByRole("button", { name: "Läs menyn" }));
    await screen.findByTestId("menu-answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await sentNames(0)).toEqual(["c.jpg", "b.jpg"]);
  });

  it("takes at most six pages and says how many were left out; Läs noggrannare reads all pages again", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await u.upload(screen.getByTestId("menu-file"), files("1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg", "7.jpg"));
    await waitFor(() => expect(screen.getAllByTestId("menu-page")).toHaveLength(6));
    expect(screen.getByRole("alert")).toHaveTextContent("Högst 6 sidor. En bild kom inte med.");
    expect(screen.queryByTestId("menu-add-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-pages-full")).toHaveTextContent("Högst 6 sidor");
    await waitFor(() => expect(screen.getByRole("button", { name: "Läs menyn" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Läs menyn" }));
    await screen.findByTestId("menu-answer");
    expect(await sentNames(0)).toEqual(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"]);
    await u.click(screen.getByRole("button", { name: "Läs noggrannare" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1]![1].body as FormData).get("quality")).toBe("careful");
    expect(await sentNames(1)).toHaveLength(6);
  });

  it("a page the reading could not read is named on the answer; Ta om replaces just that page and Läs menyn reads again", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(reading({ ...menu, olasbara_sidor: [2] })));
    const u = user();
    render(<MenuAdvisor />);
    await u.upload(screen.getByTestId("menu-file"), files("a.jpg", "b.jpg", "c.jpg"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Läs menyn" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Läs menyn" }));
    const answerScreen = await screen.findByTestId("menu-answer");
    // The dishes of the other pages are there all the same.
    expect(within(answerScreen).getAllByTestId("menu-person")).toHaveLength(1);
    expect(answerScreen).toHaveTextContent("Sida 2 gick inte att läsa, så rätterna där saknas.");
    await u.click(screen.getByRole("button", { name: "Ta om sida 2" }));
    const pages = await screen.findAllByTestId("menu-page");
    expect(pages[1]).toHaveAttribute("data-status", "trouble");
    expect(pages[1]).toHaveTextContent("Sidan gick inte att läsa.");
    await u.upload(screen.getByTestId("menu-file"), files("b2.jpg"));
    await waitFor(() => expect(screen.getAllByTestId("menu-page").map((page) => page.dataset.status)).toEqual(["ready", "ready", "ready"]));
    expect(labels()).toEqual(["Sida 1 av 3", "Sida 2 av 3", "Sida 3 av 3"]);
    await u.click(screen.getByRole("button", { name: "Läs menyn" }));
    await screen.findByTestId("menu-answer");
    expect(await sentNames(1)).toEqual(["a.jpg", "b2.jpg", "c.jpg"]);
    expect(screen.queryByText(/gick inte att läsa/)).not.toBeInTheDocument();
  });

  it("on a phone Fota menyn and Lägg till sida open the back camera, and Välj från album picks several from the library", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)", addEventListener: () => {}, removeEventListener: () => {} }));
    const u = user();
    render(<MenuAdvisor />);
    const camera = screen.getByTestId("menu-camera");
    expect(camera).toHaveAttribute("capture", "environment");
    expect(camera).not.toHaveAttribute("multiple");
    expect(screen.getByTestId("menu-file")).toHaveAttribute("multiple");
    const opened = vi.spyOn(camera, "click");
    await u.click(screen.getByTestId("menu-photo"));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("menu-album")).toHaveTextContent("Välj från album");
    await u.upload(camera, files("a.jpg"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Läs menyn" })).toBeEnabled());
    await u.click(screen.getByTestId("menu-add-page"));
    expect(opened).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Välj från album" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Tolka menyn on the pages ends it at the start, and the next photo starts a new menu", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await u.upload(screen.getByTestId("menu-file"), files("a.jpg", "b.jpg"));
    await waitFor(() => expect(screen.getAllByTestId("menu-page")).toHaveLength(2));
    await u.click(screen.getByRole("button", { name: "Tolka menyn" }));
    expect(screen.getByTestId("menu-start")).toBeInTheDocument();
    await u.upload(screen.getByTestId("menu-file"), files("c.jpg"));
    await waitFor(() => expect(labels()).toEqual(["Sida 1 av 1"]));
  });
});

describe("the answer", () => {
  it("alone and without preferences: three cards for the person, the best chosen, no marks, and a sand box that nothing is sorted out", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    const mine = screen.getByRole("radiogroup", { name: "Rätt åt Du" });
    const cards = within(mine).getAllByRole("radio");
    expect(cards).toHaveLength(3);
    expect(cards.filter((card) => (card as HTMLInputElement).checked)).toHaveLength(1);
    expect(document.querySelector("[data-tone='mint'], [data-tone='sand'], [data-tone='danger']")).toBeNull();
    const box = screen.getByTestId("menu-unfiltered");
    expect(box).toHaveTextContent("Ingen av er har angett allergier, så inget är bortsorterat.");
    expect(within(box).getByRole("link", { name: "Lägg till allergi" })).toHaveAttribute("href", "/installningar/medlemmar#smak-och-allergier");
    // Above the people, under the title.
    expect(box.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The dish is explained under its name.
    expect(screen.getByText("Risgryta med skaldjur, saffran och musslor.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klart" })).toBeInTheDocument();
    // One title and one back link; no tabs, no "Byt rätt" sheet: the proposals are right there.
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Det här passar er"]);
    expect(screen.getByRole("button", { name: "Tolka menyn" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Förslag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Byt rätt/ })).not.toBeInTheDocument();
    // Two clear buttons for what is added on top.
    expect(within(screen.getByTestId("menu-person")).getByRole("button", { name: "Lägg till rätt åt dig" })).toBeInTheDocument();
    expect(within(screen.getByTestId("menu-person")).getByRole("button", { name: "Lägg till dryck åt dig" })).toBeInTheDocument();
    expect(screen.queryByText(/Skicka till sällskapet/)).not.toBeInTheDocument();
  });

  it("the back link Tolka menyn ends the reading at the start", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    await u.click(screen.getByRole("button", { name: "Tolka menyn" }));
    expect(screen.getByTestId("menu-start")).toBeInTheDocument();
  });

  it("with company: a group per person, only the reasons that change something, and one tap changes the choice and the total", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    const groups = screen.getAllByTestId("menu-person");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Du", "Anna"]);
    expect(within(groups[0]).getByTestId("menu-drink-row")).toHaveTextContent("Öl");
    expect(within(groups[0]).getByTestId("menu-drink-row")).toHaveTextContent("Din vanliga dryck");
    expect(within(groups[1]).getByTestId("menu-drink-row")).toHaveTextContent("Vin");
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
    expect(within(screen.getByRole("radiogroup", { name: "Rätt åt Du" })).getAllByRole("radio")).toHaveLength(1);
  });

  it("Klart shows Ert val: the name as printed, the description, the drink, the allergy line and the total; Ändra and ‹ Förslag go back", async () => {
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
    await u.click(screen.getByRole("button", { name: "Klart" }));
    await u.click(screen.getByRole("button", { name: "Förslag" }));
    expect(screen.getByTestId("menu-answer")).toBeInTheDocument();
  });

  it("the usual drink is a row of its own with a price; another drink is added, the usual one can be taken away, and the total follows", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    const kr = (text: string | null | undefined) => Number((text ?? "").replace(/\D/g, ""));
    const total = () => kr(screen.getByTestId("menu-total").textContent);
    const me = () => within(screen.getAllByTestId("menu-person")[0]!);
    const before = total();
    // The usual drink (öl, 55 kr on the menu) is visible and counted.
    expect(me().getByTestId("menu-drink-row")).toHaveTextContent("Din vanliga dryck");
    expect(me().getByTestId("menu-drink-row")).toHaveTextContent("55 kr");
    await u.click(me().getByTestId("menu-add-drink"));
    const sheet = within(screen.getByRole("dialog", { name: "Lägg till dryck åt Du" }));
    expect(sheet.getByRole("button", { name: "Lägg till cocktail" })).toHaveTextContent("ca 140 kr");
    await u.click(sheet.getByRole("button", { name: "Lägg till cocktail" }));
    // The sheet stays open for the next one, and says what happened.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: "Cocktail, tillagd" })).toHaveTextContent("Tillagd");
    expect(sheet.getByTestId("menu-drink-line")).toHaveTextContent("Cocktail lades till åt Du.");
    await u.click(sheet.getAllByRole("button", { name: "Klar" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(me().getAllByTestId("menu-drink-row")).toHaveLength(2);
    expect(total()).toBe(before + 140);
    // Taking the usual one away leaves the cocktail.
    await u.click(me().getByRole("button", { name: "Ta bort öl" }));
    expect(me().getAllByTestId("menu-drink-row")).toHaveLength(1);
    expect(me().getByTestId("menu-drink-row")).toHaveTextContent("Cocktail");
    expect(total()).toBe(before + 140 - 55);
    await u.click(screen.getByRole("button", { name: "Klart" }));
    const mine = screen.getAllByTestId("menu-choice-person")[0]!;
    expect(mine).toHaveTextContent("Cocktail");
    expect(mine).not.toHaveTextContent("Öl");
  });

  it("the drink sheet adds several drinks, answers a drink the person has with a line, and Utan dryck takes them all away", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    const me = () => within(screen.getAllByTestId("menu-person")[0]!);
    await u.click(me().getByTestId("menu-add-drink"));
    const sheet = within(screen.getByRole("dialog", { name: "Lägg till dryck åt Du" }));
    // The usual one says Redan med, and a tap on it is answered, not ignored.
    expect(sheet.getByRole("button", { name: "Öl, redan med" })).toHaveTextContent("Redan med");
    await u.click(sheet.getByRole("button", { name: "Öl, redan med" }));
    expect(sheet.getByTestId("menu-drink-line")).toHaveTextContent("Du har redan öl.");
    expect(me().getAllByTestId("menu-drink-row")).toHaveLength(1);
    await u.click(sheet.getByRole("button", { name: "Lägg till cocktail" }));
    await u.click(sheet.getByRole("button", { name: "Lägg till kaffe" }));
    expect(me().getAllByTestId("menu-drink-row")).toHaveLength(3);
    // Utan dryck is the last choice, with no price, and leaves one plain row.
    expect(sheet.getByRole("button", { name: "Lägg till utan dryck" })).not.toHaveTextContent("kr");
    await u.click(sheet.getByRole("button", { name: "Lägg till utan dryck" }));
    expect(sheet.getByTestId("menu-drink-line")).toHaveTextContent("Du är utan dryck.");
    expect(me().queryAllByTestId("menu-drink-row")).toHaveLength(0);
    expect(me().getByTestId("menu-no-drink")).toHaveTextContent("Utan dryck");
  });

  it("each person is a card of their own with avatar, name and what they land on, and the proposals are right in it", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    const cards = screen.getAllByTestId("menu-person");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getAllByRole("radio").length).toBeGreaterThanOrEqual(1);
      expect(within(card).getByTestId("menu-person-total")).toHaveTextContent(/^ca \d+ kr$/);
      expect(within(card).getAllByTestId("menu-dismiss-proposal").length).toBe(within(card).getAllByRole("radio").length);
      expect(card).not.toHaveAttribute("data-folded");
    }
    expect(cards[0]).toHaveTextContent("Du");
    expect(cards[1]).toHaveTextContent("Anna");
    // The person's sum is the dish plus the drink; the two sums are the total.
    const kr = (text: string | null | undefined) => Number((text ?? "").replace(/\D/g, ""));
    const sums = cards.map((card) => kr(within(card).getByTestId("menu-person-total").textContent));
    expect(sums[0]! + sums[1]!).toBe(kr(screen.getByTestId("menu-total").textContent));
  });

  it("the nota: folded it is the sum and Klart; a tap on the sum unfolds every dish and drink per person, and it grows with an addition", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    expect(screen.queryByTestId("menu-receipt")).not.toBeInTheDocument();
    const toggle = screen.getByTestId("menu-receipt-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await u.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const receipt = within(screen.getByTestId("menu-receipt"));
    expect(receipt.getByRole("region", { name: "Nota Du" })).toHaveTextContent("Ölca 55 kr");
    expect(receipt.getByRole("region", { name: "Nota Anna" })).toHaveTextContent("Vin");
    const lines = receipt.getAllByTestId("menu-receipt-line").length;
    await u.click(screen.getByRole("button", { name: "Lägg till dryck åt dig" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Lägg till cocktail" }));
    await u.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Klar" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(screen.getByTestId("menu-receipt")).getAllByTestId("menu-receipt-line")).toHaveLength(lines + 1);
    expect(within(screen.getByTestId("menu-receipt")).getByRole("region", { name: "Nota Du" })).toHaveTextContent("Cocktail");
    expect(screen.getByRole("button", { name: "Klart" })).toBeInTheDocument();
    await u.click(toggle);
    expect(screen.queryByTestId("menu-receipt")).not.toBeInTheDocument();
  });

  it("from four people the cards start folded to one row; the one touched opens and the one before folds", async () => {
    const u = user();
    const people = ["Du", "Anna", "Bo", "Cia", "Dan"].map((name, i) => ({ id: i === 0 ? "me" : `g${i}`, name, kind: i === 0 ? "member" : "guest", allergies: [], tastes: {}, dislikes: [], likes: [], drink: i === 1 ? "vin" : null }));
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify({ v: 1, people }));
    localStorage.setItem("livskoll-menu-company-v1", JSON.stringify(people.map((person) => person.id)));
    render(<MenuAdvisor />);
    await toAnswer(u);
    const cards = () => screen.getAllByTestId("menu-person");
    expect(cards()).toHaveLength(5);
    expect(cards().every((card) => card.getAttribute("data-folded") === "true")).toBe(true);
    // One row: name, a short summary, the sum; no radio cards until it opens.
    expect(within(cards()[1]!).getByTestId("menu-person-summary")).toHaveTextContent("Vin");
    expect(within(cards()[1]!).queryByRole("radio")).not.toBeInTheDocument();
    await u.click(within(cards()[1]!).getByRole("button", { expanded: false }));
    expect(cards()[1]).not.toHaveAttribute("data-folded");
    expect(within(cards()[1]!).getAllByRole("radio").length).toBeGreaterThan(0);
    await u.click(within(cards()[2]!).getByRole("button", { expanded: false }));
    expect(cards()[2]).not.toHaveAttribute("data-folded");
    expect(cards()[1]).toHaveAttribute("data-folded", "true");
  });

  it("Ert val: a card per person with every dish large, the drinks as one row, the person's sum; a person without a dish says so", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await u.click(screen.getByRole("button", { name: "Lägg till rätt åt Anna" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Lägg till Pimientos de padrón" }));
    await u.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Klar" })[0]!);
    await u.click(screen.getByRole("button", { name: "Lägg till dryck åt Anna" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Lägg till cocktail" }));
    await u.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Klar" })[0]!);
    await u.click(within(chosenRow(within(screen.getAllByTestId("menu-person")[1]!))).getByTestId("menu-dismiss-proposal"));
    await u.click(screen.getByRole("button", { name: "Klart" }));
    const anna = within(screen.getAllByTestId("menu-choice-person")[1]!);
    expect(anna.queryByTestId("menu-choice-main")).not.toBeInTheDocument();
    expect(anna.getByTestId("menu-choice-extra")).toHaveTextContent("Pimientos de padrón");
    expect(anna.getByTestId("menu-drink-line")).toHaveTextContent("Cocktail");
    expect(anna.getByTestId("menu-drink-line")).toHaveTextContent("ca 235 kr");
    // The person's own sum is in the card's head.
    expect(screen.getAllByTestId("menu-choice-person")[1]).toHaveTextContent(/ca \d+ kr/);
    expect(within(screen.getAllByTestId("menu-choice-person")[0]!).getByTestId("menu-choice-main")).toBeInTheDocument();
  });

  it("Klart in Ert val ends the journey at the start", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    await u.click(screen.getByRole("button", { name: "Klart" }));
    await u.click(screen.getByRole("button", { name: "Klart" }));
    expect(screen.getByRole("heading", { name: "Tolka menyn" })).toBeInTheDocument();
  });
});

describe("the whole menu and a dish", () => {
  it("the whole menu, reached by a link under the answer: the place and the language, the same footer, and Förslag goes back", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    const total = screen.getByTestId("menu-total").textContent;
    await openFullMenu(u);
    const full = screen.getByTestId("menu-full");
    expect(within(full).getByRole("heading", { name: "Hela menyn", level: 1 })).toBeInTheDocument();
    expect(full).toHaveTextContent("Taverna Mock · översatt från spanska");
    expect(screen.getByTestId("menu-total").textContent).toBe(total);
    await backToAnswer(u);
    expect(screen.getByTestId("menu-answer")).toBeInTheDocument();
    await openFullMenu(u);
    await u.click(screen.getByRole("button", { name: "Klart" }));
    expect(screen.getByTestId("menu-choice")).toBeInTheDocument();
  });

  it("groups the dishes with name, price and explanation, searches, and marks a dish someone cannot eat with a red dot and the name", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await openFullMenu(u);
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
    await openFullMenu(u);
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
    // Never silent: the dish she cannot eat is shown red with the reason. A dessert is added on top of her main course.
    expect(document.querySelector("[data-tone='danger']")).toHaveTextContent("Innehåller nötter. Fråga personalen.");
    expect(within(screen.getByRole("region", { name: "Anna" })).getByTestId("menu-extra")).toHaveTextContent("Tarta de Santiago");
    expect(within(screen.getByRole("radiogroup", { name: "Rätt åt Anna" })).getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("'Lägg till rätt' opens the whole menu for Anna in a sheet; a tap adds at once and the sheet stays open for more", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await u.click(screen.getByRole("button", { name: "Lägg till rätt åt Anna" }));
    const sheet = within(screen.getByRole("dialog", { name: "Lägg till åt Anna" }));
    // Groups in the menu's order, no drinks, and a price on every row that has one.
    expect(sheet.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Förrätt", "Varmrätt", "Efterrätt"]);
    expect(sheet.getByTestId("menu-add-count")).toHaveTextContent("Tryck på en rätt");
    await u.click(sheet.getByRole("button", { name: "Lägg till Tortilla española" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: "Tortilla española, tillagd åt Anna" })).toHaveTextContent("Tillagd");
    expect(sheet.getByTestId("menu-add-count")).toHaveTextContent("1 tillagd");
    await u.click(sheet.getByRole("button", { name: "Lägg till Pimientos de padrón" }));
    expect(sheet.getByTestId("menu-add-count")).toHaveTextContent("2 tillagda");
    // A search narrows the list.
    await u.type(sheet.getByRole("searchbox", { name: "Sök rätt" }), "paella");
    expect(sheet.getAllByTestId("menu-add-row")).toHaveLength(1);
    await u.click(sheet.getAllByRole("button", { name: "Klar" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const extras = within(screen.getByRole("region", { name: "Anna" })).getAllByTestId("menu-extra");
    expect(extras.map((extra) => extra.textContent)).toEqual([expect.stringContaining("Tortilla"), expect.stringContaining("Pimientos")]);
  });

  it("a dish with an allergen of the person is a red row that needs a second tap, 'Lägg till ändå'", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    await u.click(screen.getByRole("button", { name: "Lägg till rätt åt Anna" }));
    const sheet = within(screen.getByRole("dialog", { name: "Lägg till åt Anna" }));
    expect(sheet.getByTestId("menu-add-allergy")).toHaveTextContent("Innehåller nötter");
    await u.click(sheet.getByRole("button", { name: "Lägg till Tarta de Santiago" }));
    // The first tap only asks: nothing is added yet.
    expect(within(screen.getByRole("region", { name: "Anna" })).queryByTestId("menu-extra")).not.toBeInTheDocument();
    expect(sheet.getByTestId("menu-add-count")).toHaveTextContent("Tryck på en rätt");
    await u.click(sheet.getByRole("button", { name: "Lägg till ändå Tarta de Santiago" }));
    expect(sheet.getByTestId("menu-add-count")).toHaveTextContent("1 tillagd");
    await u.click(sheet.getAllByRole("button", { name: "Klar" })[0]!);
    expect(within(screen.getByRole("region", { name: "Anna" })).getByTestId("menu-extra")).toHaveTextContent("Tarta de Santiago");
  });

  it("a dish the person already has says Redan med in the sheet and a tap on it adds nothing", async () => {
    const u = user();
    await withAnna(u);
    await readPhoto(u);
    await screen.findByTestId("menu-answer");
    const chosen = within(screen.getByRole("radiogroup", { name: "Rätt åt Du" })).getByRole("radio", { checked: true }).closest("label")!.querySelector(".font-bold")!.textContent!;
    await u.click(screen.getByRole("button", { name: "Lägg till rätt åt dig" }));
    const sheet = within(screen.getByRole("dialog", { name: "Lägg till åt Du" }));
    expect(sheet.getByRole("button", { name: `${chosen}, redan med` })).toHaveTextContent("Redan med");
    await u.click(sheet.getByRole("button", { name: `${chosen}, redan med` }));
    expect(sheet.getByTestId("menu-add-count")).toHaveTextContent("Tryck på en rätt");
  });

  it("Ikväll: a dish is added in its sheet, the sum counts the priced ones, and the list clears", async () => {
    const u = user();
    render(<MenuAdvisor />);
    await toAnswer(u);
    await openFullMenu(u);
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

// Pontus 2026-11-14: "Fler rätter" from the answer did not seem to add anything, and the sum did not move. "Lägg till
// åt" replaced the person's dish instead of adding to it. A realistic table: Du, Anna with a gluten allergy, Greta
// without an account; dishes with and without a price.
describe("adding more dishes from the menu", () => {
  const bistro: Menu = {
    restaurang: "Bistro Mock",
    sprak: "sv",
    osakert: [],
    ratter: [
      dish({ originalnamn: "Toast Skagen", grupp: "Förrätt", forklaring: "Räkröra på smörstekt bröd.", kategori: "skaldjur", allergener: ["gluten", "skaldjur"], pris: 145 }),
      dish({ originalnamn: "Dagens soppa", grupp: "Förrätt", forklaring: "Fråga personalen.", kategori: "vegetariskt", pris: null }),
      dish({ originalnamn: "Pasta carbonara", forklaring: "Pasta med bacon och äggula.", allergener: ["gluten", "agg"], pris: 189 }),
      dish({ originalnamn: "Entrecote", forklaring: "Grillad entrecote med bearnaise.", pris: 295 }),
      dish({ originalnamn: "Laxfilé", forklaring: "Ugnsbakad lax med potatis.", kategori: "fisk", allergener: ["fisk"], pris: 245 }),
      dish({ originalnamn: "Dagens fisk", forklaring: "Fråga personalen.", kategori: "fisk", pris: null }),
      dish({ originalnamn: "Chokladfondant", grupp: "Efterrätt", forklaring: "Varm chokladkaka med glass.", allergener: ["agg"], pris: 115 }),
      dish({ originalnamn: "Husets vin", grupp: "Drycker", forklaring: "Ett glas.", kategori: "ej_tillampligt", pris: 95 }),
    ],
  };
  const table = {
    v: 1,
    people: [
      { id: "me", name: "Du", kind: "member", allergies: [], tastes: {}, drink: null },
      { id: "a", name: "Anna", kind: "member", allergies: ["gluten"], tastes: {}, drink: null },
      { id: "p-greta", name: "Greta", kind: "guest", allergies: [], tastes: {}, drink: null },
    ],
  };
  const kr = (text: string | null | undefined) => Number((text ?? "").replace(/\D/g, ""));
  const total = () => kr(screen.getByTestId("menu-total").textContent);
  const region = (name: string) => within(screen.getByRole("region", { name }));

  async function atTheTable(u: ReturnType<typeof userEvent.setup>) {
    fetchMock.mockImplementation(() => Promise.resolve(reading(bistro)));
    localStorage.setItem("livskoll-menu-people-v1", JSON.stringify(table));
    localStorage.setItem("livskoll-menu-company-v1", JSON.stringify(["me", "a", "p-greta"]));
    render(<MenuAdvisor />);
    await toAnswer(u);
  }

  /** "Lägg till rätt åt <who>", the dish (a second tap when it has her allergen), Klar. */
  async function addFor(u: ReturnType<typeof userEvent.setup>, who: string, name: string) {
    await u.click(screen.getByRole("button", { name: `Lägg till rätt åt ${who}` }));
    const sheet = within(screen.getByRole("dialog"));
    await u.click(sheet.getByRole("button", { name: new RegExp(`^Lägg till ${name}`) }));
    const again = sheet.queryByRole("button", { name: new RegExp(`^Lägg till ändå ${name}`) });
    if (again) await u.click(again);
    await u.click(sheet.getAllByRole("button", { name: "Klar" })[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it("a starter added from Hela menyn for someone else than the first is added on top: under her, in the sum and in Ert val", async () => {
    const u = user();
    await atTheTable(u);
    const main = region("Greta").getByRole("radio", { checked: true }).getAttribute("value");
    const before = total();
    await openFullMenu(u);
    await u.click(screen.getByRole("button", { name: /Toast Skagen/ }));
    const sheet = within(screen.getByRole("dialog", { name: "Toast Skagen" }));
    await u.click(sheet.getByRole("radio", { name: "Greta" }));
    await u.click(sheet.getByRole("button", { name: "Lägg till åt Greta" }));
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    // Her main course is still chosen, and the starter is with her, not with Du.
    expect(region("Greta").getByRole("radio", { checked: true })).toHaveAttribute("value", main);
    expect(region("Greta").getByTestId("menu-extra")).toHaveTextContent("Toast Skagen");
    expect(region("Greta").getByTestId("menu-extra")).toHaveTextContent("ca 145 kr");
    expect(region("Du").queryByTestId("menu-extra")).not.toBeInTheDocument();
    expect(region("Greta").getByRole("status")).toHaveTextContent("Greta får också Toast Skagen.");
    expect(total()).toBe(before + 145);
    await u.click(screen.getByRole("button", { name: "Klart" }));
    const greta = within(screen.getByRole("region", { name: "Greta" }));
    expect(greta.getByTestId("menu-choice-extra")).toHaveTextContent("Toast Skagen");
    expect(total()).toBe(before + 145);
  });

  it("a dessert for Du and a starter Anna cannot eat: both counted, hers red with the reason; Ta bort takes one away again", async () => {
    const u = user();
    await atTheTable(u);
    const before = total();
    await addFor(u, "dig", "Chokladfondant");
    expect(region("Du").getByTestId("menu-extra")).toHaveTextContent("Chokladfondant");
    expect(total()).toBe(before + 115);
    await addFor(u, "Anna", "Toast Skagen");
    const extra = region("Anna").getByTestId("menu-extra");
    expect(extra).toHaveTextContent("Innehåller gluten. Fråga personalen.");
    expect(within(extra).getByText("Innehåller gluten. Fråga personalen.")).toHaveAttribute("data-tone", "danger");
    expect(total()).toBe(before + 115 + 145);
    await u.click(region("Du").getByRole("button", { name: "Ta bort Chokladfondant" }));
    expect(region("Du").queryByTestId("menu-extra")).not.toBeInTheDocument();
    expect(total()).toBe(before + 145);
  });

  describe("more about a dish on the answer", () => {
    beforeEach(() => {
      explainDish.mockReset();
    forgetExplanations();
    });

    it("every proposal has a button that opens the dish without choosing it", async () => {
      const u = user();
      await atTheTable(u);
      const before = total();
      const buttons = screen.getAllByRole("button", { name: /^Mer om / });
      expect(buttons.length).toBeGreaterThanOrEqual(3);
      const name = buttons[0]!.getAttribute("aria-label")!.replace(/^Mer om /, "");
      await u.click(buttons[0]!);
      const sheet = within(screen.getByRole("dialog"));
      expect(sheet.getByTestId("menu-dish-sheet")).toHaveTextContent(allergyDisclaimer);
      expect(sheet.getByTestId("menu-dish-more-button")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveTextContent(name);
      // Only told about: nothing to add and nothing starred.
      expect(sheet.queryByTestId("menu-dish-add")).toBeNull();
      expect(sheet.queryByTestId("menu-dish-tonight")).toBeNull();
      expect(total()).toBe(before);
    });

    it("Mer om rätten asks once for the dish and shows the Swedish text", async () => {
      explainDish.mockResolvedValue(
        ok({ svenskt_namn: "Översatt rätt", beskrivning: "En varm rätt med potatis.", smak_och_storlek: "Mild och mättande.", ursprung: "Från Spanien.", osakert: "Såsen kan skilja." }),
      );
      const u = user();
      await atTheTable(u);
      await u.click(screen.getAllByRole("button", { name: /^Mer om / })[0]!);
      await u.click(within(screen.getByRole("dialog")).getByTestId("menu-dish-more-button"));
      const more = await within(screen.getByRole("dialog")).findByTestId("menu-dish-more");
      expect(more).toHaveTextContent("En varm rätt med potatis.");
      expect(more).toHaveTextContent("Mild och mättande.");
      expect(more).toHaveTextContent("Från Spanien.");
      expect(more).toHaveTextContent("Såsen kan skilja.");
      expect(more).toHaveTextContent("Restaurangen kan göra den annorlunda");
      expect(explainDish).toHaveBeenCalledTimes(1);
      const sent = explainDish.mock.calls[0]![0] as Record<string, unknown>;
      expect(sent).toMatchObject({ language: bistro.sprak, restaurant: bistro.restaurang });
      expect(Object.keys(sent).sort()).toEqual(["ingredients", "language", "name", "restaurant", "summary"]);
    });

    it("a failed explanation says so and can be tried again", async () => {
      explainDish.mockResolvedValueOnce(fail("ai_unavailable")).mockResolvedValueOnce(
        ok({ svenskt_namn: "", beskrivning: "Andra försöket gick bra.", smak_och_storlek: "", ursprung: "", osakert: "" }),
      );
      const u = user();
      await atTheTable(u);
      await u.click(screen.getAllByRole("button", { name: /^Mer om / })[0]!);
      const dialog = within(screen.getByRole("dialog"));
      await u.click(dialog.getByTestId("menu-dish-more-button"));
      expect(await dialog.findByRole("alert")).toHaveTextContent("Det gick inte att hämta mer om rätten just nu.");
      expect(dialog.getByTestId("menu-dish-more-button")).toHaveTextContent("Försök igen");
      await u.click(dialog.getByTestId("menu-dish-more-button"));
      expect(await dialog.findByTestId("menu-dish-more")).toHaveTextContent("Andra försöket gick bra.");
    });
  });

  it("a dish without a price is added and says that the sum does not change", async () => {
    const u = user();
    await atTheTable(u);
    const before = total();
    await u.click(screen.getByRole("button", { name: "Lägg till rätt åt Greta" }));
    // Said before the tap, not after.
    expect(within(screen.getByRole("dialog")).getAllByText("Pris saknas, räknas inte med")).toHaveLength(2);
    await u.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Klar" })[0]!);
    await addFor(u, "Greta", "Dagens soppa");
    expect(region("Greta").getByTestId("menu-extra")).toHaveTextContent("Dagens soppa");
    expect(region("Greta").getByTestId("menu-extra")).toHaveTextContent("Pris saknas");
    expect(total()).toBe(before);
    expect(screen.getByTestId("menu-footer")).toHaveTextContent("1 rätt saknar pris och räknas inte med");
  });

  it("a dish added twice stays one row, and the sum counts it once", async () => {
    const u = user();
    await atTheTable(u);
    await addFor(u, "Greta", "Toast Skagen");
    const after = total();
    await u.click(screen.getByRole("button", { name: "Lägg till rätt åt Greta" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Toast Skagen, redan med" })).toBeInTheDocument();
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Toast Skagen, redan med" }));
    await u.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Klar" })[0]!);
    expect(region("Greta").getAllByTestId("menu-extra")).toHaveLength(1);
    expect(total()).toBe(after);
  });

  it("the proposed dish can be taken away even when nothing was added, and chosen again with a tap", async () => {
    const u = user();
    await atTheTable(u);
    const before = total();
    const count = region("Greta").getAllByRole("radio").length;
    await u.click(within(chosenRow(region("Greta"))).getByTestId("menu-dismiss-proposal"));
    expect(region("Greta").queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(region("Greta").getAllByRole("radio")).toHaveLength(count - 1);
    expect(total()).toBeLessThan(before);
    await u.click(region("Greta").getAllByRole("radio")[0]!);
    expect(region("Greta").getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  describe("taking proposals away", () => {
    it("the soptunna on a proposal you do not like takes it away without touching what is chosen, and Ångra puts it back", async () => {
      const u = user();
      await atTheTable(u);
      const before = total();
      const all = names(region("Greta"));
      const chosen = region("Greta").getByRole("radio", { checked: true }).closest("label")!.querySelector(".font-bold")!.textContent;
      const other = region("Greta").getAllByRole("radio").find((radio) => !(radio as HTMLInputElement).checked)!;
      const otherName = other.closest("label")!.querySelector(".font-bold")!.textContent!;
      await u.click(within(other.closest<HTMLElement>("[data-testid=menu-proposal-row]")!).getByTestId("menu-dismiss-proposal"));
      expect(names(region("Greta"))).toEqual(all.filter((name) => name !== otherName));
      expect(region("Greta").getByRole("radio", { checked: true }).closest("label")).toHaveTextContent(chosen!);
      expect(total()).toBe(before);
      expect(region("Greta").getByTestId("menu-added")).toHaveTextContent(`Tog bort ${otherName}.`);
      await u.click(region("Greta").getByTestId("menu-undo"));
      expect(names(region("Greta"))).toEqual(all);
      expect(region("Greta").queryByTestId("menu-added")).toBeNull();
    });

    it("when every proposal is taken away the card says so, and Lägg till rätt shows them as taken away and puts one back", async () => {
      const u = user();
      await atTheTable(u);
      const all = names(region("Greta"));
      while (region("Greta").queryAllByRole("radio").length > 0) await u.click(region("Greta").getAllByTestId("menu-dismiss-proposal")[0]!);
      expect(region("Greta").getByTestId("menu-no-proposals")).toHaveTextContent("Du har tagit bort alla förslag.");
      await u.click(screen.getByRole("button", { name: "Lägg till rätt åt Greta" }));
      const sheet = within(screen.getByRole("dialog"));
      const back = sheet.getByRole("button", { name: `Ta tillbaka ${all[0]} bland förslagen` });
      expect(back.closest("li")).toHaveTextContent("Förslag du tog bort");
      await u.click(back);
      expect(sheet.getByRole("button", { name: new RegExp(`^${all[0]}, tillbaka bland förslagen`) })).toBeInTheDocument();
      expect(sheet.getByTestId("menu-add-count")).toHaveTextContent("1 tillagd");
      await u.click(sheet.getAllByRole("button", { name: "Klar" })[0]!);
      // It is a proposal again, and with nothing chosen it is the chosen one; it is not also an extra.
      expect(names(region("Greta"))).toEqual([all[0]]);
      expect(region("Greta").getByRole("radio", { checked: true })).toBeInTheDocument();
      expect(region("Greta").queryByTestId("menu-extra")).toBeNull();
    });
  });

  it("another main course is added too, nothing is replaced; the soptunna takes one away; an allergen of hers is red", async () => {
    const u = user();
    await atTheTable(u);
    const before = total();
    const was = region("Anna").getByRole("radio", { checked: true }).closest("label")!.querySelector(".font-bold")!.textContent!;
    await addFor(u, "Anna", "Pasta carbonara");
    // The proposed dish is still chosen; the carbonara is with her on top and counted.
    expect(region("Anna").getByRole("radio", { checked: true }).closest("label")).toHaveTextContent(was);
    expect(region("Anna").getByTestId("menu-extra")).toHaveTextContent("Pasta carbonara");
    expect(region("Anna").getByText("Innehåller gluten. Fråga personalen.")).toHaveAttribute("data-tone", "danger");
    expect(total()).toBe(before + 189);
    // Two main courses: the proposed one can be taken away with its soptunna.
    const wasSek = kr(region("Anna").getByRole("radio", { checked: true }).closest("label")!.textContent!.match(/ca \d+ kr/)?.[0]);
    await u.click(within(chosenRow(region("Anna"))).getByTestId("menu-dismiss-proposal"));
    expect(region("Anna").queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(region("Anna").getByTestId("menu-extra")).toHaveTextContent("Pasta carbonara");
    expect(total()).toBe(before + 189 - wasSek);
  });
});

describe("a menu handed in by the route layer", () => {
  it("initialMenu goes straight to the answer: no photo, no reading", async () => {
    render(<MenuAdvisor initialMenu={menu} />);
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readMenuText).not.toHaveBeenCalled();
  });

  it("startWithMenuText reads the text once through readMenuText and goes on to the answer", async () => {
    readMenuText.mockResolvedValue(ok({ menu, quality: "standard", escalated: false, model: "Haiku 5.5", effort: "låg" }));
    render(<MenuAdvisor startWithMenuText="Paella 200 kr" />);
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    expect(readMenuText).toHaveBeenCalledTimes(1);
    expect(readMenuText).toHaveBeenCalledWith({ text: "Paella 200 kr", quality: "standard" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed text reading says so in Swedish on a stop, and Försök igen reads the same text again", async () => {
    readMenuText.mockResolvedValueOnce(fail("ai_unavailable"));
    readMenuText.mockResolvedValueOnce(ok({ menu, quality: "standard", escalated: false }));
    const u = user();
    render(<MenuAdvisor startWithMenuText="Paella 200 kr" />);
    const stop = await screen.findByTestId("menu-stop");
    expect(stop).toHaveTextContent("Menyn kunde inte läsas. Kontrollera nätet och försök igen.");
    expect(stop).not.toHaveTextContent("Fotot finns kvar");
    await u.click(within(stop).getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByTestId("menu-answer")).toBeInTheDocument();
    expect(readMenuText).toHaveBeenNthCalledWith(2, { text: "Paella 200 kr", quality: "standard" });
  });

  it("stays off with the Tillval off: nothing is read", async () => {
    localStorage.clear();
    render(<MenuAdvisor startWithMenuText="Paella 200 kr" />);
    expect(await screen.findByText(/Menyrådgivaren är avstängd/)).toBeInTheDocument();
    expect(readMenuText).not.toHaveBeenCalled();
  });
});
