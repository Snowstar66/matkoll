import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartIcon, FridgeIcon, MealPlanIcon, RecipesIcon } from "../icons";
import { currentState, mainDestinations } from "./destinations";
import { SideMenu } from "./side-menu";
import { TabBar } from "./tab-bar";

const pathname = vi.hoisted(() => ({ current: "/lista" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

// Emoji and other pictographs; the tab bar and side menu use line icons only (Story 11.1).
const pictograph = /\p{Extended_Pictographic}/u;

describe("mainDestinations", () => {
  it("has the four surfaces with their names (Story 10.4) and line icons (Story 11.1)", () => {
    expect(mainDestinations.map(({ href, label, Icon }) => [href, label, Icon])).toEqual([
      ["/recept", "Recept", RecipesIcon],
      ["/matsedel", "Matsedel", MealPlanIcon],
      ["/lista", "Inköpslista", CartIcon],
      ["/hemma", "Lagersaldo", FridgeIcon],
    ]);
  });

  it("has no emoji in a label", () => {
    for (const { label, labelParts } of mainDestinations) {
      expect(label).not.toMatch(pictograph);
      expect((labelParts ?? [label]).join("")).toBe(label);
    }
  });
});

describe("currentState", () => {
  it("is page on the destination, true below it and nothing elsewhere", () => {
    expect(currentState("/lista", "/lista")).toBe("page");
    expect(currentState("/recept/1", "/recept")).toBe("true");
    expect(currentState("/listan", "/lista")).toBeUndefined();
    expect(currentState(null, "/lista")).toBeUndefined();
  });
});

describe("tab bar and side menu icons", () => {
  beforeEach(() => {
    pathname.current = "/lista";
  });

  it("the tab bar shows the cart on Inköpslista in accent, as the current page, with a hidden icon", async () => {
    render(<TabBar />);
    const list = await screen.findByRole("link", { name: "Inköpslista" });
    expect(list).toHaveAttribute("aria-current", "page");
    expect(list).toHaveClass("text-accent");
    const icon = list.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    // The cart's two wheels set it apart from the old checklist icon.
    expect(icon?.querySelectorAll("circle")).toHaveLength(2);

    const pantry = screen.getByRole("link", { name: "Lagersaldo" });
    expect(pantry).not.toHaveAttribute("aria-current");
    expect(pantry).toHaveClass("text-ink-3");
    expect(pantry.querySelector("svg rect")).not.toBeNull();
  });

  it("the side menu has the same icons and no emoji", async () => {
    pathname.current = "/hemma";
    render(<SideMenu />);
    const nav = screen.getByRole("navigation", { name: "Huvudmeny" });
    const pantry = await within(nav).findByRole("link", { name: "Lagersaldo" });
    expect(pantry).toHaveAttribute("aria-current", "page");
    expect(nav.textContent).not.toMatch(pictograph);
    for (const link of within(nav).getAllByRole("link")) {
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });
});
