import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentState, mainDestinations } from "./destinations";
import { SideMenu } from "./side-menu";
import { TabBar } from "./tab-bar";

const pathname = vi.hoisted(() => ({ current: "/lista" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

// Emoji and other pictographs: labels carry none; the emoji sit in their own hidden span.
const pictograph = /\p{Extended_Pictographic}/u;

describe("mainDestinations", () => {
  it("has the five surfaces with their names (Story 10.4, Epic 18) and the sketch's emoji (Story 14.4)", () => {
    expect(mainDestinations.map(({ href, label, emoji }) => [href, label, emoji])).toEqual([
      ["/recept", "Recept", "\u{1F4D6}"],
      ["/matsedel", "Matsedel", "\u{1F4C5}"],
      ["/lista", "Inköpslista", "\u{1F6D2}"],
      ["/hemma", "Förråd", "\u{1F4E6}"],
      ["/prylar", "Prylar", "\u{1F9F0}"],
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

describe("tab bar and side menu emoji (Story 14.4)", () => {
  beforeEach(() => {
    pathname.current = "/lista";
  });

  it("the tab bar shows the current emoji in colour and the others grey and dimmed, all hidden from screen readers", async () => {
    render(<TabBar />);
    const list = await screen.findByRole("link", { name: "Inköpslista" });
    expect(list).toHaveAttribute("aria-current", "page");
    expect(list).toHaveClass("text-accent");
    const icon = list.querySelector("[aria-hidden]");
    expect(icon).toHaveTextContent("\u{1F6D2}");
    expect(icon).not.toHaveClass("grayscale");

    const pantry = screen.getByRole("link", { name: "Förråd" });
    expect(pantry).not.toHaveAttribute("aria-current");
    expect(pantry).toHaveClass("text-ink-3");
    const dimmed = pantry.querySelector("[aria-hidden]");
    expect(dimmed).toHaveTextContent("\u{1F4E6}");
    expect(dimmed).toHaveClass("grayscale", "opacity-70");
  });

  it("the side menu has the same emoji, with Inställningar last", async () => {
    pathname.current = "/hemma";
    render(<SideMenu />);
    const nav = screen.getByRole("navigation", { name: "Huvudmeny" });
    const pantry = await within(nav).findByRole("link", { name: "Förråd" });
    expect(pantry).toHaveAttribute("aria-current", "page");
    expect(nav.textContent).toContain("\u2699\uFE0F");
    for (const link of within(nav).getAllByRole("link")) {
      expect(link.querySelector("[aria-hidden]")).toBeInTheDocument();
    }
  });
});
