import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveOption } from "@/lib/options";
import { TodayCard } from "./today-card";

const recipes = [{ id: "r1", title: "Spagettipumpa" }];

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
  it("shows the date and the season line with a link to the recipe", () => {
    render(<TodayCard recipes={recipes} />);
    expect(screen.getByText("Dagens · sön 8 nov")).toBeTruthy();
    expect(screen.getByText(/Pumpan är som bäst nu/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Spagettipumpa" }).getAttribute("href")).toBe("/recept/r1");
    expect(screen.queryByText(/namnsdag/)).toBeNull();
  });

  it("hides until tomorrow with the X", () => {
    render(<TodayCard recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Dölj idag" }));
    expect(screen.queryByTestId("dagens-card")).toBeNull();
    cleanup();
    render(<TodayCard recipes={recipes} />);
    expect(screen.queryByTestId("dagens-card")).toBeNull();
    cleanup();
    vi.setSystemTime(new Date("2026-11-09T10:00:00+01:00"));
    render(<TodayCard recipes={recipes} />);
    expect(screen.getByTestId("dagens-card")).toBeTruthy();
  });

  it("shows the name day when switched on and nothing when Visa Dagens is off", () => {
    render(<TodayCard recipes={recipes} />);
    act(() => saveOption("dagensNameDay", true));
    expect(screen.getByText("Vendela har namnsdag")).toBeTruthy();
    act(() => saveOption("dagensShow", false));
    expect(screen.queryByTestId("dagens-card")).toBeNull();
  });

  it("shows no card when every line is off", () => {
    saveOption("dagensFood", false);
    render(<TodayCard recipes={recipes} />);
    expect(screen.queryByTestId("dagens-card")).toBeNull();
  });
});
