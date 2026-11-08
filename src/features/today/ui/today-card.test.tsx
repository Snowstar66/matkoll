import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveOption } from "@/lib/options";
import { TodayCard } from "./today-card";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T10:00:00+01:00"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TodayCard", () => {
  it("shows the date tile and the season line without a recipe", () => {
    render(<TodayCard />);
    const tile = screen.getByRole("img", { name: "Söndag 8 november" });
    expect(tile.textContent).toBe("Sön8NOV");
    expect(screen.queryByText(/Dagens ·/)).toBeNull();
    expect(screen.getByText("Grönkålen är som bäst nu.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/namnsdag/)).toBeNull();
  });

  it("hides until tomorrow with the X", () => {
    render(<TodayCard />);
    fireEvent.click(screen.getByRole("button", { name: "Dölj idag" }));
    expect(screen.queryByTestId("dagens-card")).toBeNull();
    cleanup();
    render(<TodayCard />);
    expect(screen.queryByTestId("dagens-card")).toBeNull();
    cleanup();
    vi.setSystemTime(new Date("2026-11-09T10:00:00+01:00"));
    render(<TodayCard />);
    expect(screen.getByTestId("dagens-card")).toBeTruthy();
  });

  it("shows the name day when switched on and nothing when Visa Dagens is off", () => {
    render(<TodayCard />);
    act(() => saveOption("dagensNameDay", true));
    expect(screen.getByText("Vendela har namnsdag")).toBeTruthy();
    act(() => saveOption("dagensShow", false));
    expect(screen.queryByTestId("dagens-card")).toBeNull();
  });

  it("loads the almanac line only when its switch is on", async () => {
    render(<TodayCard />);
    expect(screen.queryByText(/^[宜忌] /)).toBeNull();
    act(() => saveOption("dagensAlmanac", true));
    expect(await screen.findByText(/^宜 /)).toBeTruthy();
  });

  it("puts the almanac's 忌 part on a line of its own", async () => {
    render(<TodayCard />);
    act(() => saveOption("dagensAlmanac", true));
    expect(await screen.findByText(/^宜 /)).toBeTruthy();
    expect(screen.getByText(/^忌 Undvik att/)).toBeTruthy();
  });

  it("has a switch each for food days and the season", () => {
    saveOption("dagensSeason", false);
    render(<TodayCard />);
    expect(screen.queryByTestId("dagens-card")).toBeNull();
    act(() => saveOption("dagensSeason", true));
    expect(screen.getByTestId("dagens-card")).toBeTruthy();
  });

  it("shows no card when every line is off", () => {
    saveOption("dagensFood", false);
    saveOption("dagensSeason", false);
    render(<TodayCard />);
    expect(screen.queryByTestId("dagens-card")).toBeNull();
  });
});
