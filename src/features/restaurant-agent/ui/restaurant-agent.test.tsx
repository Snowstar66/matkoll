import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { saveOption } from "@/lib/options";
import type { FindResult } from "./actions-port";
import { fakeActions, fyrvaktaren, okResult, salvia, wok } from "./fake-actions";
import { directMapQuery, flagLines, hostOf, mapLink, mapLinkFor, ratingText, safeHttpsUrl } from "./format";
import { RestaurantAgentCard } from "./restaurant-card";
import { RestaurantFlow } from "./restaurant-flow";
import { settingsStorageKey } from "./settings-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });
const denied = (_ok: (lat: number, lng: number) => void, fail: () => void) => fail();
const at = (lat: number, lng: number) => (ok: (lat: number, lng: number) => void) => ok(lat, lng);
const here = at(59.8586, 17.6389);

// The AI web search is parked behind its own Tillval; most of these tests are about it, so it is on unless a test turns it off.
beforeEach(() => {
  window.localStorage.clear();
  saveOption("restaurantAgentWeb", true);
});

// The place is fetched by itself when the screen shows; the search can start once it is there.
async function typePlace(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByTestId("restaurant-find")).toBeEnabled());
  await user.click(screen.getByTestId("restaurant-find"));
}

describe("RestaurantAgentCard", () => {
  it("is not there with the Tillval off, and opens on tap with it on", async () => {
    const onOpen = vi.fn();
    const view = render(<RestaurantAgentCard onOpen={onOpen} />);
    expect(screen.queryByTestId("restaurant-agent-card")).toBeNull();
    view.unmount();
    saveOption("restaurantAgent", true);
    render(<RestaurantAgentCard onOpen={onOpen} />);
    const card = screen.getByTestId("restaurant-agent-card");
    expect(card).toHaveTextContent("Vill ni ha hjälp att välja restaurang?");
    await userEvent.setup().click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("location step", () => {
  it("asks the phone for the place by itself when the screen shows, once, without a tap", async () => {
    const getPosition = vi.fn(at(59.8586, 17.6389));
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={getPosition} />);
    await waitFor(() => expect(getPosition).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("restaurant-place-got")).toHaveTextContent("Din plats är hämtad");
    expect(screen.getByTestId("restaurant-place-got")).not.toHaveTextContent("cirka 1 km");
    expect(getPosition).toHaveBeenCalledTimes(1);
  });

  it("has no button for the place, no text field for a place and no menu link", () => {
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} onUseMenu={vi.fn()} getPosition={here} />);
    expect(screen.queryByText("Använd min plats")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/ort eller postnummer/i)).toBeNull();
    expect(screen.queryByTestId("menu-link-input")).toBeNull();
    expect(screen.queryByText("Några val. Resten sköter jag.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Sök restauranger" })).toBeInTheDocument();
  });

  it("says it is fetching while the phone has not answered", () => {
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={() => {}} />);
    expect(screen.getByTestId("restaurant-place-asking")).toHaveTextContent("Hämtar din plats …");
    expect(screen.getByTestId("restaurant-find")).toBeDisabled();
  });

  it("sends the place rounded to two decimals (about 1 km)", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={at(59.858612345, 17.638987654)} />);
    await typePlace(user);
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalled());
    expect(actions.findRestaurants.mock.calls[0]![0].location).toEqual({ kind: "coords", lat: 59.86, lng: 17.64 });
  });

  it("shows a stop screen 'Vi vet inte var du är' on a refusal, keeps the map button working and asks again on 'Försök igen'", async () => {
    const user = userEvent.setup();
    const getPosition = vi.fn(denied);
    const onClose = vi.fn();
    render(<RestaurantFlow actions={fakeActions()} onClose={onClose} getPosition={getPosition} />);
    expect(screen.getByRole("heading", { name: "Vi vet inte var du är" })).toBeInTheDocument();
    expect(screen.getByTestId("restaurant-place-failed")).toHaveTextContent("Google Maps använder då telefonens egen plats");
    expect(screen.getByTestId("restaurant-place-failed")).toHaveTextContent("slå på plats för Livskoll i telefonens inställningar");
    expect(screen.queryByTestId("restaurant-find")).toBeNull();
    expect(screen.queryByTestId("restaurant-radar")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Tolka menyn/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("direct-map-link")).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=restaurang");
    getPosition.mockImplementation(here);
    await user.click(screen.getByTestId("restaurant-place-retry"));
    expect(getPosition).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId("restaurant-place-got")).toBeInTheDocument();
    expect(screen.queryByTestId("restaurant-place-retry")).toBeNull();
    expect(screen.getByTestId("restaurant-find")).toBeEnabled();
    expect(screen.getByTestId("restaurant-radar")).toBeInTheDocument();
  });

  it("says so, without a retry button, when the device cannot give a place", () => {
    const geo = Object.getOwnPropertyDescriptor(navigator, "geolocation");
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    try {
      render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} />);
      expect(screen.getByRole("heading", { name: "Vi vet inte var du är" })).toBeInTheDocument();
      expect(screen.getByTestId("restaurant-place-failed")).not.toHaveTextContent("slå på plats");
      expect(screen.queryByTestId("restaurant-place-retry")).toBeNull();
      expect(screen.getByTestId("direct-map-link")).toBeInTheDocument();
    } finally {
      if (geo) Object.defineProperty(navigator, "geolocation", geo);
      else delete (navigator as unknown as { geolocation?: unknown }).geolocation;
    }
  });
});

describe("choices and 'Sugen på'", () => {
  it("sends party, priorities and cuisines, and remembers them on this device only", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={here} />);
    await user.click(screen.getByRole("button", { name: "Fler personer" }));
    await user.click(screen.getByRole("button", { name: "Lugnt" }));
    await user.click(screen.getByRole("button", { name: "Pizza" }));
    await user.click(screen.getByRole("button", { name: "Asiatiskt" }));
    await typePlace(user);
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalled());
    const input = actions.findRestaurants.mock.calls[0]![0];
    expect(input.settings).toEqual({ radiusM: 1000, when: "evening", party: 3, cuisines: ["pizza", "asiatiskt"], priorities: ["quiet"] });
    expect(input.cuisines).toEqual(["pizza", "asiatiskt"]);
    expect(JSON.parse(window.localStorage.getItem(settingsStorageKey) ?? "{}")).toEqual(input.settings);
  });

  it("with the web search off shows only how far and 'Sugen på': no När, Vi är or priorities", () => {
    window.localStorage.clear();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    expect(screen.getByRole("radiogroup", { name: "Hur långt?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pizza" })).toBeInTheDocument();
    expect(screen.queryByText("När")).toBeNull();
    expect(screen.queryByText("Vi är")).toBeNull();
    expect(screen.queryByText("Viktigast för oss")).toBeNull();
    expect(screen.queryByText("Valen kommer ihåg på den här enheten. Inget sparas hos oss.")).toBeNull();
    expect(screen.queryByText(/Vi fyller i sökningen åt dig/)).toBeNull();
    expect(screen.queryByText(/Vad ska väga mest/)).toBeNull();
  });

  it("with the web search on also shows När, Vi är and 'Viktigast för oss' (högst tre)", () => {
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    expect(screen.getByText("När")).toBeInTheDocument();
    expect(screen.getByText("Vi är")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Viktigast för oss" })).toBeInTheDocument();
    expect(screen.queryByText(/Vad ska väga mest/)).toBeNull();
    expect(screen.queryByText(/Det som passar allas mat väger alltid/)).toBeNull();
  });

  it("allows at most three 'Sugen på' chips", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    for (const name of ["Pizza", "Asiatiskt", "Italienskt", "Sushi"]) await user.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: "Sushi" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Italienskt" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts from the choices saved on this device", () => {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify({ party: 4, cuisines: ["fisk"], priorities: [] }));
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    expect(screen.getByRole("button", { name: "Fisk och skaldjur" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("running and results", () => {
  it("shows the waiting screen and lets the person stop it; a late answer is ignored", async () => {
    let finish: (result: FindResult) => void = () => {};
    const actions = fakeActions();
    actions.findRestaurants.mockImplementation(() => new Promise<FindResult>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    expect(screen.getByTestId("restaurant-running")).toHaveTextContent("Letar åt er");
    await user.click(screen.getByTestId("restaurant-cancel"));
    expect(screen.getByTestId("restaurant-where")).toBeInTheDocument();
    finish(okResult());
    await Promise.resolve();
    expect(screen.getByTestId("restaurant-where")).toBeInTheDocument();
  });

  it("shows cards with source chips, links to check the place, and the honest web line", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    const cards = await screen.findAllByTestId("restaurant-card");
    expect(cards).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "3 ställen åt er" })).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Trattoria Salvia")).toBeInTheDocument();
    expect(within(cards[0]!).getByTestId("menu-status")).toHaveTextContent("Meny hittad");
    expect(within(cards[2]!).getByTestId("menu-status")).toHaveTextContent("Meny saknas");
    // The restaurant's page is always a link when a page is known, https only.
    expect(within(cards[0]!).getByTestId("site-link")).toHaveAttribute("href", "https://www.trattoriasalvia.example/");
    expect(within(cards[0]!).getByTestId("site-link")).toHaveTextContent("Restaurangens sida");
    expect(within(cards[1]!).getByTestId("site-link")).toHaveAttribute("href", "https://fyrvaktaren.example/");
    expect(within(cards[2]!).queryByTestId("site-link")).toBeNull();
    expect(within(cards[0]!).getByTestId("source-link")).toHaveTextContent("trattoriasalvia.example");
    expect(screen.getByTestId("web-line")).toHaveTextContent("Hämtat från webben – kontrollera öppettider och meny");
    expect(screen.getByText("Ring och kolla före ni åker.")).toBeInTheDocument();
    expect(within(cards[2]!).getByText(/Menyn hittades inte/)).toBeInTheDocument();
  });

  it("shows a quoted address and hours with their source, and says so when they are missing", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    const cards = await screen.findAllByTestId("restaurant-card");
    expect(within(cards[0]!).getByTestId("place-address")).toHaveTextContent("Adress Exempelgatan 4 (enligt trattoriasalvia.example, kontrollera)");
    expect(within(cards[0]!).getByTestId("place-hours")).toHaveTextContent("Mån-fre 11-21");
    expect(within(cards[0]!).getByTestId("place-address").querySelector("a")).toHaveAttribute("href", "https://www.trattoriasalvia.example/kontakt");
    expect(within(cards[2]!).getByTestId("place-address-missing")).toHaveTextContent("Adress saknas, öppna kartan.");
    expect(within(cards[2]!).getByTestId("place-hours-missing")).toHaveTextContent("Ring och kolla");
  });

  it("links Google Maps only, with the name and the city, never coordinates, marked as opening outside the app", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    const cards = await screen.findAllByTestId("restaurant-card");
    const links = within(cards[0]!).getAllByTestId("map-link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://www.google.com/maps/search/?api=1&query=Trattoria%20Salvia%20Uppsala"]);
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(within(links[0]!).getByRole("img", { name: "Öppnas utanför appen" })).toBeInTheDocument();
    expect(links[0]).toHaveTextContent("Öppna i Google Maps");
    expect(document.body.innerHTML).not.toMatch(/apple/i);
    expect(within(within(cards[0]!).getByTestId("site-link")).getByRole("img", { name: "Öppnas utanför appen" })).toBeInTheDocument();
  });

  it("shows a rating as a small line with its source and the caveat, and nothing without one", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    const cards = await screen.findAllByTestId("restaurant-card");
    const line = within(cards[0]!).getByTestId("place-rating");
    expect(line).toHaveTextContent("Betyg 4,3/5 (120) enligt omdomen.example");
    expect(line).toHaveTextContent("Omdömen från webben kan vara gamla eller ojämna");
    expect(line.querySelector("a")).toHaveAttribute("href", "https://omdomen.example/salvia");
    expect(within(cards[1]!).queryByTestId("place-rating")).toBeNull();
    expect(within(cards[2]!).queryByTestId("place-rating")).toBeNull();
  });

  it("selects the first place and hands over the one chosen", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    expect(await screen.findByTestId("restaurant-choose")).toHaveTextContent("Välj Trattoria Salvia");
    await user.click(screen.getAllByTestId("restaurant-select")[1]!);
    expect(screen.getByTestId("restaurant-choose")).toHaveTextContent(`Välj ${fyrvaktaren.name}`);
  });

  it("opens the detail sheet with the area, the links and the web line", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    await user.click((await screen.findAllByTestId("restaurant-more"))[0]!);
    const detail = await screen.findByTestId("restaurant-detail");
    expect(detail).toHaveTextContent("Centrum");
    expect(detail).toHaveTextContent("Hämtat från webben");
    expect(within(detail).getAllByTestId("map-link")).toHaveLength(1);
  });

  it("does not link an address that is not https", async () => {
    const actions = fakeActions(okResult([{ ...salvia, website: "javascript:alert(1)", address: null, hours: null, rating: { value: 4, scale: 5, count: null, sourceName: "x", sourceUrl: "http://plain.example" }, why: [{ text: "Bra.", sourceUrl: "http://plain.example" }] }]));
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    await screen.findByTestId("restaurant-card");
    expect(screen.queryByTestId("site-link")).toBeNull();
    expect(screen.queryByTestId("source-link")).toBeNull();
    expect(screen.queryByTestId("place-rating")).toBeNull();
  });
});

describe("handover", () => {
  it("passes the menu text on when the route layer allows it", async () => {
    const onUseMenu = vi.fn();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} onUseMenu={onUseMenu} getPosition={here} />);
    await typePlace(user);
    await user.click(await screen.findByTestId("restaurant-choose"));
    expect(screen.getByTestId("restaurant-handover")).toHaveAttribute("data-menu", "found");
    await user.click(screen.getByTestId("restaurant-use-menu"));
    expect(onUseMenu).toHaveBeenCalledWith({ id: salvia.id, name: salvia.name, menuText: salvia.menuText });
  });

  it("offers the photo of the menu when the menu is missing", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions(okResult([wok]))} onClose={onClose} getPosition={here} />);
    await typePlace(user);
    await user.click(await screen.findByTestId("restaurant-choose"));
    expect(screen.getByTestId("restaurant-handover")).toHaveAttribute("data-menu", "missing");
    expect(screen.getByText("Menyn hittades inte på webben.")).toBeInTheDocument();
    await user.click(screen.getByTestId("restaurant-photo"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("stops", () => {
  const stopFor = async (result: FindResult) => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions(result)} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    return user;
  };

  it("needs_location goes back to the question with a text", async () => {
    await stopFor({ status: "needs_location" });
    expect(await screen.findByTestId("restaurant-where")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Din plats kunde inte hämtas");
  });

  it("no_results offers to change the search", async () => {
    const user = await stopFor({ status: "no_results" });
    await user.click(await screen.findByRole("button", { name: "Ändra sökningen" }));
    expect(screen.getByTestId("restaurant-where")).toBeInTheDocument();
  });

  it("an empty ok list is the same as no results", async () => {
    await stopFor(okResult([]));
    expect(await screen.findByText("Inget hittades")).toBeInTheDocument();
  });

  it("cap_reached explains, links to the cost setting and offers the photo", async () => {
    await stopFor({ status: "cap_reached" });
    expect(await screen.findByText("Dagens AI-tak är nått")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Höj taket" })).toHaveAttribute("href", "/installningar/ai-kostnad");
    expect(screen.getByRole("button", { name: "Ta en bild på menyn i stället" })).toBeInTheDocument();
  });

  it("error shows the message and tries again with the same place", async () => {
    const actions = fakeActions({ status: "error", message: "Sökningen svarade inte." });
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    expect(await screen.findByText("Sökningen svarade inte.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Försök igen" }));
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalledTimes(2));
  });

  it("a call that throws becomes an error screen", async () => {
    const actions = fakeActions();
    actions.findRestaurants.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    expect(await screen.findByText(/Det gick inte att nå tjänsten/)).toBeInTheDocument();
  });
});

describe("settings sheet", () => {
  it("changes the choices from the result and searches again with them", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    await user.click(await screen.findByTestId("restaurant-settings-open"));
    const sheet = await screen.findByTestId("restaurant-settings");
    await user.click(within(sheet).getByRole("button", { name: "Sushi" }));
    await user.click(screen.getByTestId("restaurant-search-again"));
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalledTimes(2));
    expect(actions.findRestaurants.mock.calls[1]![0].settings.cuisines).toEqual(["sushi"]);
  });
});

describe("format", () => {
  it("words flags, links, ratings and map addresses", () => {
    expect(flagLines(["menu_missing", "allergy_unverified", "nonsense"])).toEqual(["Allergier är inte kontrollerade mot menyn."]);
    expect(safeHttpsUrl("http://a.se")).toBeNull();
    expect(hostOf("https://www.a.se/x")).toBe("a.se");
    expect(ratingText({ value: 4.3, scale: 5, count: 120 })).toBe("Betyg 4,3/5 (120)");
    expect(ratingText({ value: 8, scale: 10, count: null })).toBe("Betyg 8/10");
  });
  it("gives one Google Maps link; only name and city, encoded", () => {
    const link = mapLink("Café Å & Ö", "Uppsala");
    expect(link).toEqual({ label: "Google Maps", href: "https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20%C3%85%20%26%20%C3%96%20Uppsala" });
  });

  it("builds the direct map search from the niches and the typed place only", () => {
    expect(directMapQuery(["pizza", "asiatiskt", "italienskt"], "Uppsala")).toBe("pizza asiatisk italiensk restaurang Uppsala");
    expect(directMapQuery([], null)).toBe("restaurang");
    expect(directMapQuery(["fisk"], "  ")).toBe("fisk restaurang");
    expect(directMapQuery(["pizza", "sushi", "fisk", "indiskt"], "Lund")).toBe("pizza sushi fisk restaurang Lund");
  });

  it.each([
    [500, 15],
    [1000, 14],
    [2000, 13],
    [5000, 12],
  ] as const)("opens the map around the rounded position for %i m: zoom %i", (radiusM, zoom) => {
    expect(mapLinkFor("pizza restaurang", { lat: 59.86, lng: 17.64, radiusM })).toEqual({ label: "Google Maps", href: `https://www.google.com/maps/search/pizza%20restaurang/@59.86,17.64,${zoom}z` });
  });

  it("puts no position in the link without one, and rounds the position it has to two decimals", () => {
    expect(/@/.test(mapLinkFor("x").href)).toBe(false);
    expect(mapLinkFor("x", { lat: 59.858612, lng: 17.638987, radiusM: 1000 }).href).toContain("@59.86,17.64,14z");
  });
});

describe("Sök i Google Maps", () => {
  const hrefs = () => screen.getAllByTestId("direct-map-link").map((link) => link.getAttribute("href"));

  it("is one Google button that works without a fetched place and never starts the AI search", async () => {
    const actions = fakeActions();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    const links = screen.getAllByTestId("direct-map-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Sök i Google Maps");
    expect(hrefs()).toEqual(["https://www.google.com/maps/search/?api=1&query=restaurang"]);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(links[0]!).getByRole("img", { name: "Öppnas utanför appen" })).toBeInTheDocument();
    expect(screen.queryByText(/apple/i)).toBeNull();
    expect(actions.findRestaurants).not.toHaveBeenCalled();
  });

  it("follows 'Sugen på' once the place is there", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await user.click(screen.getByRole("button", { name: "Pizza" }));
    await waitFor(() => expect(hrefs()).toEqual(["https://www.google.com/maps/search/pizza%20restaurang/@59.86,17.64,14z"]));
  });

  it("uses the rounded position for the map window once the place is fetched, and the radius chosen", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={at(59.858612, 17.638987)} />);
    await user.click(screen.getByRole("radio", { name: "2 km" }));
    await waitFor(() => expect(hrefs()).toEqual(["https://www.google.com/maps/search/restaurang/@59.86,17.64,13z"]));
  });

  it("never puts allergies, names or other profile data in the address", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await user.click(screen.getByRole("button", { name: "Lugnt" }));
    await user.click(screen.getByRole("button", { name: "Fler personer" }));
    for (const href of hrefs()) expect(href).not.toMatch(/Lugnt|personer|allerg|lat=|lng=/i);
  });

  it("is also on the results screen and on the stops that leave the agent without a way on", async () => {
    const user = userEvent.setup();
    const view = render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await typePlace(user);
    expect(await screen.findByTestId("direct-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("direct-map-link")).toHaveLength(1);
    view.unmount();
    for (const status of ["no_results", "cap_reached", "error"] as const) {
      const result = status === "error" ? ({ status, message: "Sökningen svarade inte." } as const) : ({ status } as const);
      const shown = render(<RestaurantFlow actions={fakeActions(result)} onClose={vi.fn()} getPosition={here} />);
      await typePlace(user);
      expect(await screen.findByTestId("restaurant-stop")).toBeInTheDocument();
      expect(hrefs()).toEqual(["https://www.google.com/maps/search/restaurang/@59.86,17.64,14z"]);
      shown.unmount();
    }
  });
});

describe("the AI web search is a parked Tillval", () => {
  it("shows no agent button, and nothing can run the search, with restaurantAgentWeb off", async () => {
    window.localStorage.clear();
    const actions = fakeActions();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={here} />);
    expect(screen.queryByTestId("restaurant-find")).toBeNull();
    await userEvent.setup().keyboard("{Enter}");
    expect(actions.findRestaurants).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("direct-map-link")).toHaveLength(1);
  });
  it("shows 'Låt agenten föreslå ställen' under the map button with it on, active only when the place is there", async () => {
    const view = render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={() => {}} />);
    expect(screen.getByTestId("restaurant-find")).toHaveTextContent("Låt agenten föreslå ställen");
    expect(screen.getByTestId("restaurant-find")).toBeDisabled();
    view.unmount();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    await waitFor(() => expect(screen.getByTestId("restaurant-find")).toBeEnabled());
  });
});

describe("the radar and the way on to the photo", () => {
  it("shows a radar named by the chosen radius, which follows the choice, only when the place is fetched", async () => {
    const user = userEvent.setup();
    const view = render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={() => {}} />);
    expect(screen.queryByTestId("restaurant-radar")).toBeNull();
    view.unmount();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={here} />);
    expect(screen.getByRole("img", { name: "Sökområde: ungefär 1 km" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "5 km" }));
    expect(screen.getByRole("img", { name: "Sökområde: ungefär 5 km" })).toBeInTheDocument();
    expect(screen.getByTestId("restaurant-radar")).toHaveTextContent("Inom cirka 5 km");
    expect(screen.getByText("Ungefär så stort område visas i kartan.")).toBeInTheDocument();
  });

  it("'Framme? Fota menyn' calls onPhoto, and falls back to onClose when onPhoto is left out", async () => {
    const user = userEvent.setup();
    const onPhoto = vi.fn();
    const onClose = vi.fn();
    const view = render(<RestaurantFlow actions={fakeActions()} onClose={onClose} onPhoto={onPhoto} getPosition={here} />);
    await user.click(screen.getByRole("button", { name: "Framme? Fota menyn" }));
    expect(onPhoto).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    view.unmount();
    render(<RestaurantFlow actions={fakeActions()} onClose={onClose} getPosition={here} />);
    await user.click(screen.getByRole("button", { name: "Framme? Fota menyn" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
