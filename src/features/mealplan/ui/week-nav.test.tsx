import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { WeekSelectNav } from "./week-nav";

const now = new Date("2026-10-29T10:00:00Z");

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

describe("WeekSelectNav (Inköpslistan)", () => {
  it("offers this week and next week, with the viewed week chosen", () => {
    render(<WeekSelectNav weekStart="2026-11-02" now={now} basePath="/lista" />);
    const select = screen.getByTestId("week-select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["Denna vecka", "Nästa vecka"]);
    expect(select.value).toBe("2026-11-02");
    expect(screen.getByLabelText("Vecka")).toBe(select);
  });

  it("adds the week further ahead as a third choice", () => {
    render(<WeekSelectNav weekStart="2026-12-07" now={now} basePath="/lista" />);
    const select = screen.getByTestId("week-select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["Denna vecka", "Nästa vecka", "Om 6 veckor"]);
    expect(select.value).toBe("2026-12-07");
  });

  it("goes to the week's address, keeping the filter, when another week is chosen", async () => {
    push.mockClear();
    render(<WeekSelectNav weekStart="2026-10-26" now={now} basePath="/lista" keepParams={{ visa: "egna" }} />);
    await userEvent.setup().selectOptions(screen.getByTestId("week-select"), "Nästa vecka");
    expect(push).toHaveBeenCalledWith("/lista?vecka=2026-W45&visa=egna", { scroll: false });
  });
});

describe("WeekSelectNav on Matsedel (UX-01, UX-03)", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    // RememberWeek counts "this week" on the real clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    window.localStorage.removeItem("livskoll-option-showPreviousWeek");
    document.cookie = "livskoll-vecka=; max-age=0; path=/";
    push.mockClear();
    replace.mockClear();
  });

  it("offers only this week and next week while Visa tidigare vecka is off", () => {
    render(<WeekSelectNav weekStart="2026-10-26" now={now} withHistory />);
    const select = screen.getByTestId("week-select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["Denna vecka", "Nästa vecka"]);
  });

  it("adds Förra veckan first and Äldre veckor › last when it is on", async () => {
    window.localStorage.setItem("livskoll-option-showPreviousWeek", "1");
    render(<WeekSelectNav weekStart="2026-10-26" now={now} withHistory />);
    const select = screen.getByTestId("week-select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["Förra veckan", "Denna vecka", "Nästa vecka", "Äldre veckor \u203A"]);
    await userEvent.setup().selectOptions(select, "Förra veckan");
    expect(push).toHaveBeenCalledWith("/matsedel?vecka=2026-W43", { scroll: false });
    await userEvent.setup().selectOptions(select, "Äldre veckor \u203A");
    expect(push).toHaveBeenLastCalledWith("/matsedel/tidigare");
  });

  it("never offers last week on Inköpslistan", () => {
    window.localStorage.setItem("livskoll-option-showPreviousWeek", "1");
    render(<WeekSelectNav weekStart="2026-10-26" now={now} basePath="/lista" />);
    const select = screen.getByTestId("week-select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["Denna vecka", "Nästa vecka"]);
  });

  it("shows last week chosen without remembering it", () => {
    window.localStorage.setItem("livskoll-option-showPreviousWeek", "1");
    render(<WeekSelectNav weekStart="2026-10-19" now={now} withHistory />);
    expect((screen.getByTestId("week-select") as HTMLSelectElement).value).toBe("2026-10-19");
    expect(document.cookie).not.toContain("livskoll-vecka");
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends you to this week when last week is open and the Tillval is off", () => {
    render(<WeekSelectNav weekStart="2026-10-19" now={now} withHistory />);
    expect(replace).toHaveBeenCalledWith("/matsedel?vecka=2026-W44", { scroll: false });
  });

  it("remembers this week as before", () => {
    render(<WeekSelectNav weekStart="2026-10-26" now={now} withHistory />);
    expect(document.cookie).toContain("livskoll-vecka=2026-W44");
  });
});
