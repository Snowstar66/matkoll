import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SettingsGroupData, SettingsMenu } from "./settings-menu";

const pathname = vi.hoisted(() => ({ current: "/installningar" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const groups: SettingsGroupData[] = [
  { label: "Konto", rows: [{ href: "/installningar/konto", icon: "👤", tile: "bg-mint", title: "pontus@example.com" }] },
  {
    label: "Hushåll",
    rows: [
      { href: "/installningar/boenden", icon: "📍", tile: "bg-sand", title: "Boenden", value: "Hemma, Duved" },
      { href: "/installningar/butiker", icon: "🏪", tile: "bg-tile-clay", title: "Butiker" },
    ],
  },
];

beforeEach(() => {
  pathname.current = "/installningar";
});

describe("SettingsMenu (Story 14.7)", () => {
  it("draws each group under its label, with the rows as links with a tile, a value and a chevron", () => {
    render(<SettingsMenu groups={groups} signOut={<button>Logga ut</button>} />);
    expect(screen.getByRole("heading", { level: 2, name: "Hushåll" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Hushåll" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/installningar/boenden", "/installningar/butiker"]);
    expect(links[0]).toHaveTextContent("Boenden");
    expect(links[0]).toHaveTextContent("Hemma, Duved");
    expect(links[0]).toHaveTextContent("📍");
    expect(links[0]).toHaveTextContent("›");
    // A row without a value shows none, and the tile and chevron are decoration.
    expect(within(links[1]).queryByTestId("settings-value")).not.toBeInTheDocument();
    expect(links[1].querySelectorAll("[aria-hidden=true]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Logga ut" })).toBeInTheDocument();
  });

  it("makes every row at least 44 px high", () => {
    render(<SettingsMenu groups={groups} signOut={null} />);
    for (const link of screen.getAllByRole("link")) expect(link.className).toMatch(/min-h-12/);
  });

  it("marks the row of the open page, for the desktop where the page is beside the list", () => {
    pathname.current = "/installningar/butiker";
    render(<SettingsMenu groups={groups} signOut={null} />);
    expect(screen.getByRole("link", { name: /Butiker/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Boenden/ })).not.toHaveAttribute("aria-current");
  });
});
