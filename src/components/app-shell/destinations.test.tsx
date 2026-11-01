import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentState, mainDestinations, settingsDestination } from "./destinations";
import { SideMenu } from "./side-menu";
import { TabBar } from "./tab-bar";

const pathname = vi.hoisted(() => ({ current: "/lista" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

// Emoji and other pictographs: labels carry none; the emoji sit in their own hidden span.
const pictograph = /\p{Extended_Pictographic}/u;

describe("mainDestinations", () => {
  it("has the five surfaces with their names (Story 10.4, Epic 18), each with a line icon (Story 19.1)", () => {
    expect(mainDestinations.map(({ href, label }) => [href, label])).toEqual([
      ["/recept", "Recept"],
      ["/matsedel", "Matsedel"],
      ["/lista", "Inköpslista"],
      ["/hemma", "Matvaror"],
      ["/prylar", "Förråd"],
    ]);
    for (const { Icon } of [...mainDestinations, settingsDestination]) expect(Icon).toBeTypeOf("function");
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

describe("tab bar and side menu icons (Story 19.1)", () => {
  beforeEach(() => {
    pathname.current = "/lista";
  });

  it("the tab bar shows line icons: the current one green with a soft fill, the others grey, all hidden from screen readers", async () => {
    render(<TabBar />);
    const list = await screen.findByRole("link", { name: "Inköpslista" });
    expect(list).toHaveAttribute("aria-current", "page");
    expect(list).toHaveClass("text-accent", "font-semibold");
    const icon = list.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("fill-opacity", "0.16");

    const pantry = screen.getByRole("link", { name: "Matvaror" });
    expect(pantry).not.toHaveAttribute("aria-current");
    expect(pantry).toHaveClass("text-ink-3");
    const plain = pantry.querySelector("svg");
    expect(plain).toHaveAttribute("fill", "none");
    expect(plain).not.toHaveAttribute("fill-opacity");
    expect(pantry.textContent).not.toMatch(pictograph);
  });

  it("the side menu has the same icons, with Inställningar last", async () => {
    pathname.current = "/hemma";
    render(<SideMenu />);
    const nav = screen.getByRole("navigation", { name: "Huvudmeny" });
    const pantry = await within(nav).findByRole("link", { name: "Matvaror" });
    expect(pantry).toHaveAttribute("aria-current", "page");
    expect(pantry).toHaveClass("bg-mint", "font-medium");
    const links = within(nav).getAllByRole("link");
    expect(links.at(-1)).toHaveAccessibleName("Inställningar");
    for (const link of links) {
      expect(link.querySelector("svg")).toBeInTheDocument();
      expect(link.textContent).not.toMatch(pictograph);
    }
  });
});
