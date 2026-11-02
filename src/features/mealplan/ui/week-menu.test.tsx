import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { weekDishesText } from "../domain/week";
import { WeekMenu, type WeekMenuOption } from "./week-menu";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const options: WeekMenuOption[] = [
  { weekStart: "2026-11-02", label: "Denna vecka", detail: weekDishesText(2), param: null },
  { weekStart: "2026-11-09", label: "Nästa vecka", detail: weekDishesText(1), param: "2026-W46" },
  { weekStart: "2026-11-16", label: "Om 2 veckor", detail: weekDishesText(0), param: "2026-W47" },
];

beforeEach(() => {
  push.mockReset();
  window.history.replaceState(null, "", "/lista?visa=egna");
});

describe("WeekMenu", () => {
  it("is a small button with the viewed week, which opens the weeks with their dishes", async () => {
    render(<WeekMenu weekStart="2026-11-02" options={options} />);
    const button = screen.getByRole("button", { name: "Vecka: Denna vecka, 2 rätter" });
    expect(button).toHaveTextContent("Denna vecka");
    await userEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Vilken vecka?" });
    const rows = within(dialog).getAllByTestId("week-menu-option");
    expect(rows.map((row) => row.textContent)).toEqual(["Denna vecka2 rätter", "Nästa vecka1 rätt", "Om 2 veckorInga rätter"]);
    expect(rows[0]).toHaveAttribute("aria-checked", "true");
  });

  it("puts the chosen week in the address and keeps the filter; this week has no ?vecka=", async () => {
    const { unmount } = render(<WeekMenu weekStart="2026-11-02" options={options} />);
    await userEvent.click(screen.getByRole("button", { name: /^Vecka:/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("radio", { name: /Nästa vecka/ }));
    expect(push).toHaveBeenCalledWith("/lista?visa=egna&vecka=2026-W46", { scroll: false });
    unmount();

    window.history.replaceState(null, "", "/lista?vecka=2026-W46");
    render(<WeekMenu weekStart="2026-11-09" options={options} />);
    expect(screen.getByRole("button", { name: "Vecka: Nästa vecka, 1 rätt" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Vecka:/ }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("radio", { name: /Denna vecka/ }));
    expect(push).toHaveBeenLastCalledWith("/lista", { scroll: false });
  });
});
