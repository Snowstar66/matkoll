import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsShell } from "./settings-shell";

const segment = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => segment.current }));

describe("SettingsShell (Story 14.7, 14.8)", () => {
  it("shows only the start page on a phone, and the list beside an empty column on a desktop", () => {
    segment.current = null;
    render(
      <SettingsShell header={<h1>Rubrik</h1>} menu={<p>Lista</p>}>
        <p>Sida</p>
      </SettingsShell>,
    );
    expect(screen.getByTestId("settings-menu").className).not.toMatch(/\bhidden\b/);
    expect(screen.getByTestId("settings-page").className).toMatch(/\bhidden\b.*desktop:flex/);
    expect(screen.getByText("Rubrik").parentElement?.className).not.toMatch(/\bhidden\b/);
  });

  it("shows only the chosen page on a phone, and both columns on a desktop", () => {
    segment.current = "konto";
    render(
      <SettingsShell header={<h1>Rubrik</h1>} menu={<p>Lista</p>}>
        <p>Sida</p>
      </SettingsShell>,
    );
    expect(screen.getByTestId("settings-menu").className).toMatch(/\bhidden\b.*desktop:block/);
    expect(screen.getByTestId("settings-page").className).not.toMatch(/\bhidden\b/);
    expect(screen.getByText("Rubrik").parentElement?.className).toMatch(/\bhidden\b.*desktop:block/);
    expect(screen.getByText("Lista")).toBeInTheDocument();
    expect(screen.getByText("Sida")).toBeInTheDocument();
  });
});
