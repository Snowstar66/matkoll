import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveOption } from "@/lib/options";
import { MenuWithRestaurants } from "./menu-with-restaurants";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

beforeEach(() => {
  window.localStorage.clear();
  saveOption("menuAdvisor", true);
});

describe("MenuWithRestaurants", () => {
  it("shows no card with the Tillval off", async () => {
    render(<MenuWithRestaurants members={null} profiles={[]} />);
    expect(await screen.findByTestId("menu-start")).toBeInTheDocument();
    expect(screen.queryByTestId("restaurant-agent-card")).toBeNull();
  });

  it("shows the card on the start screen with it on, opens the journey and comes back for the photo", async () => {
    saveOption("restaurantAgent", true);
    const user = userEvent.setup();
    render(<MenuWithRestaurants members={null} profiles={[]} />);
    await user.click(await screen.findByTestId("restaurant-agent-card"));
    expect(screen.getByTestId("restaurant-where")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tillbaka" }));
    expect(await screen.findByTestId("menu-start")).toBeInTheDocument();
  });
});
