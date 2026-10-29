import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeekNav } from "./week-nav";

const now = new Date("2026-10-29T10:00:00Z");

describe("WeekNav", () => {
  it("shows this week without a way back, with a way forward", () => {
    render(<WeekNav weekStart="2026-10-26" now={now} />);
    expect(screen.getByTestId("week-name")).toHaveTextContent("Vecka 44");
    expect(screen.getByTestId("week-label")).toHaveTextContent("Denna vecka");
    expect(screen.queryByRole("link", { name: "Föregående vecka" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Idag" })).toBeNull();
    expect(screen.getByRole("link", { name: "Nästa vecka" })).toHaveAttribute("href", "/matsedel?vecka=2026-W45");
  });

  it("shows a coming week with both arrows and Idag back to this week", () => {
    render(<WeekNav weekStart="2026-11-09" now={now} />);
    expect(screen.getByTestId("week-label")).toHaveTextContent("Om 2 veckor");
    expect(screen.getByRole("link", { name: "Föregående vecka" })).toHaveAttribute("href", "/matsedel?vecka=2026-W45");
    expect(screen.getByRole("link", { name: "Idag" })).toHaveAttribute("href", "/matsedel");
  });

  it("goes back to the plain address from next week, and stops 12 weeks ahead", () => {
    const { unmount } = render(<WeekNav weekStart="2026-11-02" now={now} />);
    expect(screen.getByTestId("week-label")).toHaveTextContent("Nästa vecka");
    expect(screen.getByRole("link", { name: "Föregående vecka" })).toHaveAttribute("href", "/matsedel");
    unmount();
    render(<WeekNav weekStart="2027-01-18" now={now} />);
    expect(screen.queryByRole("link", { name: "Nästa vecka" })).toBeNull();
  });
});
