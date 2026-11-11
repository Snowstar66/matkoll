import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { saveOption } from "@/lib/options";
import type { FindResult } from "./actions-port";
import { fakeActions, fyrvaktaren, okResult, salvia, wok } from "./fake-actions";
import { directMapQuery, flagLines, hostOf, mapLinks, mapLinksFor, mapSpan, ratingText, safeHttpsUrl } from "./format";
import { RestaurantAgentCard } from "./restaurant-card";
import { RestaurantFlow } from "./restaurant-flow";
import { settingsStorageKey } from "./settings-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });
const denied = (_ok: (lat: number, lng: number) => void, fail: () => void) => fail();
const at = (lat: number, lng: number) => (ok: (lat: number, lng: number) => void) => ok(lat, lng);

// The AI web search is parked behind its own Tillval; most of these tests are about it, so it is on unless a test turns it off.
beforeEach(() => {
  window.localStorage.clear();
  saveOption("restaurantAgentWeb", true);
});

async function typePlace(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByTestId("restaurant-place-text"), text);
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
    expect(card).toHaveTextContent("Vet inte var ni ska äta?");
    await userEvent.setup().click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("location step", () => {
  it("does not ask the phone for the place until the button is tapped", async () => {
    const getPosition = vi.fn(at(59.8586, 17.6389));
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={getPosition} />);
    expect(getPosition).not.toHaveBeenCalled();
    expect(screen.getByTestId("restaurant-find")).toBeDisabled();
    await userEvent.setup().click(screen.getByTestId("restaurant-use-place"));
    expect(getPosition).toHaveBeenCalledTimes(1);
  });

  it("sends the place rounded to two decimals (about 1 km)", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={at(59.858612345, 17.638987654)} />);
    await user.click(screen.getByTestId("restaurant-use-place"));
    expect(screen.getByTestId("restaurant-place-got")).toBeInTheDocument();
    await user.click(screen.getByTestId("restaurant-find"));
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalled());
    expect(actions.findRestaurants.mock.calls[0]![0].location).toEqual({ kind: "coords", lat: 59.86, lng: 17.64 });
  });

  it("falls back to the text field when the phone says no", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await user.click(screen.getByTestId("restaurant-use-place"));
    expect(screen.getByRole("alert")).toHaveTextContent("Vi fick ingen plats");
    expect(screen.getByTestId("restaurant-find")).toBeDisabled();
    await typePlace(user, "753 20");
    await waitFor(() => expect(screen.getByTestId("restaurant-results")).toBeInTheDocument());
  });

  it("checks the typed place and sends it normalised", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    const field = screen.getByTestId("restaurant-place-text");
    await user.type(field, "http://x.se");
    await user.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("Skriv bara en ort eller ett postnummer");
    expect(screen.getByTestId("restaurant-find")).toBeDisabled();
    await user.clear(field);
    await user.type(field, "75320");
    await user.click(screen.getByTestId("restaurant-find"));
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalled());
    expect(actions.findRestaurants.mock.calls[0]![0].location).toEqual({ kind: "text", text: "753 20" });
  });
});

describe("choices and 'Sugen på'", () => {
  it("sends party, priorities and cuisines, and remembers them on this device only", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await user.click(screen.getByRole("button", { name: "Fler personer" }));
    await user.click(screen.getByRole("button", { name: "Lugnt" }));
    await user.click(screen.getByRole("button", { name: "Pizza" }));
    await user.click(screen.getByRole("button", { name: "Asiatiskt" }));
    await typePlace(user, "Uppsala");
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalled());
    const input = actions.findRestaurants.mock.calls[0]![0];
    expect(input.settings).toEqual({ radiusM: 1000, when: "evening", party: 3, cuisines: ["pizza", "asiatiskt"], priorities: ["quiet"] });
    expect(input.cuisines).toEqual(["pizza", "asiatiskt"]);
    expect(JSON.parse(window.localStorage.getItem(settingsStorageKey) ?? "{}")).toEqual(input.settings);
  });

  it("allows at most three 'Sugen på' chips", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    for (const name of ["Pizza", "Asiatiskt", "Italienskt", "Sushi"]) await user.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: "Sushi" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Italienskt" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts from the choices saved on this device", () => {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify({ party: 4, cuisines: ["fisk"], priorities: [] }));
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    expect(screen.getByRole("button", { name: "Fisk och skaldjur" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("running and results", () => {
  it("shows the waiting screen and lets the person stop it; a late answer is ignored", async () => {
    let finish: (result: FindResult) => void = () => {};
    const actions = fakeActions();
    actions.findRestaurants.mockImplementation(() => new Promise<FindResult>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    expect(screen.getByTestId("restaurant-running")).toHaveTextContent("Letar åt er");
    await user.click(screen.getByTestId("restaurant-cancel"));
    expect(screen.getByTestId("restaurant-where")).toBeInTheDocument();
    finish(okResult());
    await Promise.resolve();
    expect(screen.getByTestId("restaurant-where")).toBeInTheDocument();
  });

  it("shows cards with source chips, links to check the place, and the honest web line", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
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
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    const cards = await screen.findAllByTestId("restaurant-card");
    expect(within(cards[0]!).getByTestId("place-address")).toHaveTextContent("Adress Exempelgatan 4 (enligt trattoriasalvia.example, kontrollera)");
    expect(within(cards[0]!).getByTestId("place-hours")).toHaveTextContent("Mån-fre 11-21");
    expect(within(cards[0]!).getByTestId("place-address").querySelector("a")).toHaveAttribute("href", "https://www.trattoriasalvia.example/kontakt");
    expect(within(cards[2]!).getByTestId("place-address-missing")).toHaveTextContent("Adress saknas, öppna kartan.");
    expect(within(cards[2]!).getByTestId("place-hours-missing")).toHaveTextContent("Ring och kolla");
  });

  it("links both maps with the name and the city only, never coordinates, each marked as opening outside the app", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    const cards = await screen.findAllByTestId("restaurant-card");
    const links = within(cards[0]!).getAllByTestId("map-link");
    // jsdom is not an iPhone: Google first, then Apple, both always shown.
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.google.com/maps/search/?api=1&query=Trattoria%20Salvia%20Uppsala",
      "https://maps.apple.com/?q=Trattoria%20Salvia%20Uppsala",
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
      expect(within(link).getByRole("img", { name: "Öppnas utanför appen" })).toBeInTheDocument();
    }
    expect(links[0]).toHaveTextContent("Öppna i kartan: Google Maps");
    expect(within(within(cards[0]!).getByTestId("site-link")).getByRole("img", { name: "Öppnas utanför appen" })).toBeInTheDocument();
  });

  it("shows a rating as a small line with its source and the caveat, and nothing without one", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
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
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    expect(await screen.findByTestId("restaurant-choose")).toHaveTextContent("Välj Trattoria Salvia");
    await user.click(screen.getAllByTestId("restaurant-select")[1]!);
    expect(screen.getByTestId("restaurant-choose")).toHaveTextContent(`Välj ${fyrvaktaren.name}`);
  });

  it("opens the detail sheet with the area, the links and the web line", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    await user.click((await screen.findAllByTestId("restaurant-more"))[0]!);
    const detail = await screen.findByTestId("restaurant-detail");
    expect(detail).toHaveTextContent("Centrum");
    expect(detail).toHaveTextContent("Hämtat från webben");
    expect(within(detail).getAllByTestId("map-link")).toHaveLength(2);
  });

  it("does not link an address that is not https", async () => {
    const actions = fakeActions(okResult([{ ...salvia, website: "javascript:alert(1)", address: null, hours: null, rating: { value: 4, scale: 5, count: null, sourceName: "x", sourceUrl: "http://plain.example" }, why: [{ text: "Bra.", sourceUrl: "http://plain.example" }] }]));
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
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
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} onUseMenu={onUseMenu} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    await user.click(await screen.findByTestId("restaurant-choose"));
    expect(screen.getByTestId("restaurant-handover")).toHaveAttribute("data-menu", "found");
    await user.click(screen.getByTestId("restaurant-use-menu"));
    expect(onUseMenu).toHaveBeenCalledWith({ id: salvia.id, name: salvia.name, menuText: salvia.menuText });
  });

  it("offers the photo of the menu when the menu is missing", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions(okResult([wok]))} onClose={onClose} getPosition={denied} />);
    await typePlace(user, "Uppsala");
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
    render(<RestaurantFlow actions={fakeActions(result)} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    return user;
  };

  it("needs_location goes back to the question with a text", async () => {
    await stopFor({ status: "needs_location" });
    expect(await screen.findByTestId("restaurant-where")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Vi fick ingen plats");
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
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    expect(await screen.findByText("Sökningen svarade inte.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Försök igen" }));
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalledTimes(2));
  });

  it("a call that throws becomes an error screen", async () => {
    const actions = fakeActions();
    actions.findRestaurants.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    expect(await screen.findByText(/Det gick inte att nå tjänsten/)).toBeInTheDocument();
  });
});

describe("settings sheet", () => {
  it("changes the choices from the result and searches again with them", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
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
  it("always gives both maps, ordered by device: Apple first on iOS, Google first otherwise; only name and city, encoded", () => {
    const ios = mapLinks("Café Å & Ö", "Uppsala", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    expect(ios.map((link) => link.label)).toEqual(["Apple Kartor", "Google Maps"]);
    expect(ios[0]?.href).toBe("https://maps.apple.com/?q=Caf%C3%A9%20%C3%85%20%26%20%C3%96%20Uppsala");
    expect(ios[1]?.href).toBe("https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20%C3%85%20%26%20%C3%96%20Uppsala");
    expect(mapLinks("A", "B", "Mozilla/5.0 (Linux; Android 15)").map((link) => link.label)).toEqual(["Google Maps", "Apple Kartor"]);
    expect(mapLinks("A", "B", null).map((link) => link.label)).toEqual(["Google Maps", "Apple Kartor"]);
  });

  it("builds the direct map search from the niches and the typed place only", () => {
    expect(directMapQuery(["pizza", "asiatiskt", "italienskt"], "Uppsala")).toBe("pizza asiatisk italiensk restaurang Uppsala");
    expect(directMapQuery([], null)).toBe("restaurang");
    expect(directMapQuery(["fisk"], "  ")).toBe("fisk restaurang");
    expect(directMapQuery(["pizza", "sushi", "fisk", "indiskt"], "Lund")).toBe("pizza sushi fisk restaurang Lund");
  });

  it.each([
    [500, 15, 0.009],
    [1000, 14, 0.018],
    [2000, 13, 0.0360],
    [5000, 12, 0.0901],
  ] as const)("opens the map around the rounded position for %i m: Google zoom %i, Apple span %f", (radiusM, zoom, span) => {
    const [google, apple] = mapLinksFor("pizza restaurang", null, { lat: 59.86, lng: 17.64, radiusM });
    expect(google).toEqual({ label: "Google Maps", href: `https://www.google.com/maps/search/pizza%20restaurang/@59.86,17.64,${zoom}z` });
    expect(apple).toEqual({ label: "Apple Kartor", href: `https://maps.apple.com/?q=pizza%20restaurang&ll=59.86,17.64&spn=${span},${span}` });
    expect(mapSpan(radiusM)).toBeCloseTo(span, 3);
  });

  it("puts no position in the link without one, and rounds the position it has to two decimals", () => {
    expect(mapLinksFor("x", null).every((link) => !/@|ll=|spn=/.test(link.href))).toBe(true);
    expect(mapLinksFor("x", null, { lat: 59.858612, lng: 17.638987, radiusM: 1000 })[0]?.href).toContain("@59.86,17.64,14z");
  });
});

describe("Sök i kartan", () => {
  const hrefs = () => screen.getAllByTestId("direct-map-link").map((link) => link.getAttribute("href"));

  it("is the main action of the question screen with two buttons, before and independent of the AI search, and follows the typed place", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    const links = screen.getAllByTestId("direct-map-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("Sök i Google Maps");
    expect(links[1]).toHaveTextContent("Sök i Apple Kartor");
    expect(hrefs()).toEqual(["https://www.google.com/maps/search/?api=1&query=restaurang", "https://maps.apple.com/?q=restaurang"]);
    await user.click(screen.getByRole("button", { name: "Pizza" }));
    await user.type(screen.getByTestId("restaurant-place-text"), "Uppsala");
    expect(hrefs()).toEqual(["https://www.google.com/maps/search/?api=1&query=pizza%20restaurang%20Uppsala", "https://maps.apple.com/?q=pizza%20restaurang%20Uppsala"]);
    for (const link of screen.getAllByTestId("direct-map-link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(within(link).getByRole("img", { name: "Öppnas utanför appen" })).toBeInTheDocument();
    }
    expect(actions.findRestaurants).not.toHaveBeenCalled();
  });

  it("uses the rounded position for the map window once the person tapped Använd min plats, and the radius chosen", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={at(59.858612, 17.638987)} />);
    await user.click(screen.getByRole("radio", { name: "2 km" }));
    await user.click(screen.getByTestId("restaurant-use-place"));
    expect(hrefs()).toEqual(["https://www.google.com/maps/search/restaurang/@59.86,17.64,13z", "https://maps.apple.com/?q=restaurang&ll=59.86,17.64&spn=0.036,0.036"]);
  });

  it("never puts coordinates elsewhere, allergies, names or other profile data in the address", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await user.click(screen.getByRole("button", { name: "Lugnt" }));
    await user.click(screen.getByRole("button", { name: "Fler personer" }));
    for (const href of hrefs()) expect(href).not.toMatch(/59\.|17\.|@|lat|lng|Lugnt|personer|allerg/i);
  });

  it("is also on the results screen and on the stops that leave the agent without a way on, always with both maps", async () => {
    const user = userEvent.setup();
    const view = render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    expect(await screen.findByTestId("direct-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("direct-map-link")).toHaveLength(2);
    view.unmount();
    for (const status of ["no_results", "cap_reached", "error"] as const) {
      const result = status === "error" ? ({ status, message: "Sökningen svarade inte." } as const) : ({ status } as const);
      const shown = render(<RestaurantFlow actions={fakeActions(result)} onClose={vi.fn()} getPosition={denied} />);
      await typePlace(user, "Lund");
      expect(await screen.findByTestId("restaurant-stop")).toBeInTheDocument();
      expect(hrefs()).toEqual(["https://www.google.com/maps/search/?api=1&query=restaurang%20Lund", "https://maps.apple.com/?q=restaurang%20Lund"]);
      shown.unmount();
    }
  });
});

describe("the AI web search is a parked Tillval", () => {
  it("shows no agent button, and nothing can run the search, with restaurantAgentWeb off", async () => {
    window.localStorage.clear();
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    expect(screen.queryByTestId("restaurant-find")).toBeNull();
    await user.type(screen.getByTestId("restaurant-place-text"), "Uppsala");
    await user.keyboard("{Enter}");
    expect(actions.findRestaurants).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("direct-map-link")).toHaveLength(2);
  });
  it("shows 'Låt agenten föreslå ställen' under the map buttons with it on", () => {
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    expect(screen.getByTestId("restaurant-find")).toHaveTextContent("Låt agenten föreslå ställen");
  });
});

describe("menu link", () => {
  const onUseMenu = vi.fn();
  beforeEach(() => onUseMenu.mockReset());
  const open = (actions = fakeActions(), onClose = vi.fn()) => render(<RestaurantFlow actions={actions} onClose={onClose} onUseMenu={onUseMenu} getPosition={denied} />);

  it("reads a pasted https link and hands the text on to Menyrådgivaren", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    open(actions);
    await user.type(screen.getByTestId("menu-link-input"), "https://trattoriasalvia.example/meny");
    await user.click(screen.getByTestId("menu-link-read"));
    expect(actions.readMenuLink).toHaveBeenCalledWith("https://trattoriasalvia.example/meny");
    await waitFor(() => expect(onUseMenu).toHaveBeenCalledWith({ id: "menu-link", name: "trattoriasalvia.example", menuText: "Pasta al pomodoro 135 kr\nPizza margherita 125 kr" }));
  });

  it("says honestly that a PDF or an image cannot be read, and goes the photo way", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    open(fakeActions(okResult(), { status: "image_or_pdf" } as never) as never, onClose);
    await user.type(screen.getByTestId("menu-link-input"), "https://x.example/meny.pdf");
    await user.click(screen.getByTestId("menu-link-read"));
    expect(await screen.findByTestId("menu-link-problem")).toHaveTextContent("Sidan är en bild eller PDF, ta ett foto i stället.");
    expect(onUseMenu).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ta en bild på menyn i stället" }));
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ["invalid", "ser inte ut som en länk"],
    ["unreachable", "gick inte att hämta"],
    ["too_short", "ingen menytext"],
  ] as const)("explains %s", async (status, words) => {
    const user = userEvent.setup();
    open(fakeActions(okResult(), { status } as never) as never);
    await user.type(screen.getByTestId("menu-link-input"), "https://x.example/");
    await user.click(screen.getByTestId("menu-link-read"));
    expect(await screen.findByTestId("menu-link-problem")).toHaveTextContent(words);
  });

  it("needs a link before it can be read", () => {
    open();
    expect(screen.getByTestId("menu-link-read")).toBeDisabled();
  });
});
