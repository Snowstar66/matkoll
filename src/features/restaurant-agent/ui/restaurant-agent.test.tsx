import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { saveOption } from "@/lib/options";
import type { FindResult } from "./actions-port";
import { fakeActions, fyrvaktaren, okResult, salvia, wok } from "./fake-actions";
import { distanceText, flagLines, hostOf, openText, safeHttpsUrl } from "./format";
import { RestaurantAgentCard } from "./restaurant-card";
import { RestaurantFlow } from "./restaurant-flow";
import { settingsStorageKey } from "./settings-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });
const denied = (_ok: (lat: number, lng: number) => void, fail: () => void) => fail();
const at = (lat: number, lng: number) => (ok: (lat: number, lng: number) => void) => ok(lat, lng);

beforeEach(() => window.localStorage.clear());

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

  it("sends the place rounded to three decimals", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={at(59.858612345, 17.638987654)} />);
    await user.click(screen.getByTestId("restaurant-use-place"));
    expect(screen.getByTestId("restaurant-place-got")).toBeInTheDocument();
    await user.click(screen.getByTestId("restaurant-find"));
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalled());
    expect(actions.findRestaurants.mock.calls[0]![0].location).toEqual({ kind: "coords", lat: 59.859, lng: 17.639 });
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
  it("sends radius, party, priorities and cuisines, and remembers them on this device only", async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await user.click(screen.getByRole("radio", { name: "2 km" }));
    await user.click(screen.getByRole("button", { name: "Fler personer" }));
    await user.click(screen.getByRole("button", { name: "Lugnt" }));
    await user.click(screen.getByRole("button", { name: "Pizza" }));
    await user.click(screen.getByRole("button", { name: "Asiatiskt" }));
    await typePlace(user, "Uppsala");
    await waitFor(() => expect(actions.findRestaurants).toHaveBeenCalled());
    const input = actions.findRestaurants.mock.calls[0]![0];
    expect(input.settings).toEqual({ radiusM: 2000, party: 3, cuisines: ["pizza", "asiatiskt"], priorities: ["quiet"] });
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
    window.localStorage.setItem(settingsStorageKey, JSON.stringify({ radiusM: 5000, party: 4, cuisines: ["fisk"], priorities: [] }));
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    expect(screen.getByRole("radio", { name: "5 km" })).toHaveAttribute("aria-checked", "true");
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

  it("shows cards with source chips, Google Maps attribution and the opening-hours caveat", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    const cards = await screen.findAllByTestId("restaurant-card");
    expect(cards).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "3 ställen åt er" })).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Trattoria Salvia")).toBeInTheDocument();
    expect(within(cards[0]!).getByTestId("menu-status")).toHaveTextContent("Meny hittad");
    expect(within(cards[2]!).getByTestId("menu-status")).toHaveTextContent("Meny saknas");
    expect(within(cards[0]!).getByText("Öppet nu enligt Google Maps")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("Stängt nu enligt Google Maps")).toBeInTheDocument();
    const maps = within(cards[0]!).getByTestId("maps-link");
    expect(maps).toHaveTextContent("Google Maps");
    expect(maps).toHaveAttribute("href", salvia.mapsUrl);
    expect(maps).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(cards[0]!).getByTestId("source-link")).toHaveTextContent("trattoriasalvia.example");
    expect(screen.getByTestId("google-attribution")).toHaveTextContent("Google Maps");
    expect(screen.getByText("Ring och kolla före ni åker.")).toBeInTheDocument();
    expect(within(cards[2]!).getByText(/Menyn hittades inte/)).toBeInTheDocument();
  });

  it("selects the first place and hands over the one chosen", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    expect(await screen.findByTestId("restaurant-choose")).toHaveTextContent("Välj Trattoria Salvia");
    await user.click(screen.getAllByTestId("restaurant-select")[1]!);
    expect(screen.getByTestId("restaurant-choose")).toHaveTextContent(`Välj ${fyrvaktaren.name}`);
  });

  it("opens the detail sheet with facts and the Google line", async () => {
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions()} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    await user.click((await screen.findAllByTestId("restaurant-more"))[0]!);
    const detail = await screen.findByTestId("restaurant-detail");
    expect(detail).toHaveTextContent("Exempelgatan 4, Uppsala");
    expect(detail).toHaveTextContent("Plats och öppettider från Google Maps");
  });

  it("does not link an address that is not https", async () => {
    const actions = fakeActions(okResult([{ ...salvia, mapsUrl: "javascript:alert(1)", why: [{ text: "Bra.", sourceUrl: "http://plain.example" }] }]));
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    await screen.findByTestId("restaurant-card");
    expect(screen.queryByTestId("maps-link")).toBeNull();
    expect(screen.queryByTestId("source-link")).toBeNull();
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
    expect(onUseMenu).toHaveBeenCalledWith({ placeId: salvia.placeId, name: salvia.name, menuText: salvia.menuText });
  });

  it("offers the photo of the menu when the menu is missing", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RestaurantFlow actions={fakeActions(okResult([wok]))} onClose={onClose} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    await user.click(await screen.findByTestId("restaurant-choose"));
    expect(screen.getByTestId("restaurant-handover")).toHaveAttribute("data-menu", "missing");
    expect(screen.getByText("Menyn hittades inte på nätet.")).toBeInTheDocument();
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

  it("no_results offers a wider radius and runs again with it", async () => {
    const user = await stopFor({ status: "no_results" });
    await user.click(await screen.findByRole("button", { name: "Sök inom 2 km" }));
    expect(JSON.parse(window.localStorage.getItem(settingsStorageKey) ?? "{}").radiusM).toBe(2000);
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
    const actions = fakeActions({ status: "error", message: "Karttjänsten svarade inte." });
    const user = userEvent.setup();
    render(<RestaurantFlow actions={actions} onClose={vi.fn()} getPosition={denied} />);
    await typePlace(user, "Uppsala");
    expect(await screen.findByText("Karttjänsten svarade inte.")).toBeInTheDocument();
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
  it("words distance, hours and flags", () => {
    expect(distanceText(700)).toBe("700 m");
    expect(distanceText(1234)).toBe("1,2 km");
    expect(distanceText(null)).toBeNull();
    expect(openText(null)).toBeNull();
    expect(flagLines(["menu_missing", "allergy_unverified", "nonsense"])).toEqual(["Allergier är inte kontrollerade mot menyn."]);
    expect(safeHttpsUrl("http://a.se")).toBeNull();
    expect(hostOf("https://www.a.se/x")).toBe("a.se");
  });
});
