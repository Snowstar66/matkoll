import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import { fakeActions, okResult, salvia, wok } from "@/features/restaurant-agent/ui/fake-actions";
import { MenuWithRestaurants } from "./menu-with-restaurants";

let actions = fakeActions();
vi.mock("./restaurant-agent-actions", () => ({ restaurantActions: { findRestaurants: (input: never) => actions.findRestaurants(input) }, restaurantCostText: "" }));
const readMenuText = vi.fn();
vi.mock("@/features/menu-advisor/actions/read-menu-text", () => ({ readMenuText: (input: unknown) => readMenuText(input) }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

beforeEach(() => {
  actions = fakeActions();
  readMenuText.mockReset();
  readMenuText.mockResolvedValue(fail("ai_unavailable"));
  window.localStorage.clear();
  saveOption("menuAdvisor", true);
  // The agent asks for the place when its question screen shows; the phone here answers at once.
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 59.858, longitude: 17.639 } }) } });
});

describe("MenuWithRestaurants", () => {
  it("shows no link to Sök restauranger with the Tillval off", async () => {
    render(<MenuWithRestaurants members={null} profiles={[]} />);
    expect(await screen.findByTestId("menu-start")).toBeInTheDocument();
    expect(screen.queryByTestId("restaurant-agent-card")).toBeNull();
  });

  it("shows the link under Fota menyn with it on, opens the journey and comes back for the photo", async () => {
    saveOption("restaurantAgent", true);
    const user = userEvent.setup();
    render(<MenuWithRestaurants members={null} profiles={[]} />);
    await user.click(await screen.findByTestId("restaurant-agent-card"));
    expect(screen.getByTestId("restaurant-where")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tolka menyn" }));
    expect(await screen.findByTestId("menu-start")).toBeInTheDocument();
  });

  it("'Framme? Fota menyn' opens Tolka menyn", async () => {
    saveOption("restaurantAgent", true);
    const user = userEvent.setup();
    render(<MenuWithRestaurants members={null} profiles={[]} />);
    await user.click(await screen.findByTestId("restaurant-agent-card"));
    await user.click(screen.getByRole("button", { name: "Framme? Fota menyn" }));
    expect(await screen.findByTestId("menu-start")).toBeInTheDocument();
  });

  async function toHandover(user: ReturnType<typeof userEvent.setup>) {
    saveOption("restaurantAgent", true);
    saveOption("restaurantAgentWeb", true);
    render(<MenuWithRestaurants members={null} profiles={[]} />);
    await user.click(await screen.findByTestId("restaurant-agent-card"));
    await waitFor(() => expect(screen.getByTestId("restaurant-find")).toBeEnabled());
    await user.click(screen.getByTestId("restaurant-find"));
    await user.click(await screen.findByTestId("restaurant-choose"));
  }

  it("hands a found menu text to Menyrådgivaren, which reads it", async () => {
    const user = userEvent.setup();
    await toHandover(user);
    await user.click(screen.getByTestId("restaurant-use-menu"));
    await waitFor(() => expect(readMenuText).toHaveBeenCalledTimes(1));
    expect(readMenuText).toHaveBeenCalledWith({ text: salvia.menuText, quality: "standard" });
    expect(screen.queryByTestId("restaurant-handover")).toBeNull();
  });

  it("a missing menu goes the photo way, with nothing read", async () => {
    actions = fakeActions(okResult([wok]));
    const user = userEvent.setup();
    await toHandover(user);
    expect(screen.queryByTestId("restaurant-use-menu")).toBeNull();
    await user.click(screen.getByTestId("restaurant-photo"));
    expect(await screen.findByTestId("menu-start")).toBeInTheDocument();
    expect(readMenuText).not.toHaveBeenCalled();
  });
});
