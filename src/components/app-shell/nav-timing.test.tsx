import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveOption } from "@/lib/options";
import { NavTimingBadge, PageReady } from "./nav-timing";
import { resetNavTiming } from "./nav-timing-store";

let pathname = "/recept";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

beforeEach(() => {
  window.history.pushState({}, "", "/recept");
  localStorage.clear();
  resetNavTiming();
  pathname = "/recept";
});

function tapLink(href: string) {
  const link = document.createElement("a");
  link.setAttribute("href", href);
  document.body.append(link);
  link.click();
  link.remove();
}

describe("Visa sidtider", () => {
  it("shows nothing, and listens to nothing, with the option off", () => {
    render(
      <>
        <NavTimingBadge />
        <PageReady name="Matsedel" />
      </>,
    );
    act(() => tapLink("/matsedel"));
    pathname = "/matsedel";
    window.history.pushState({}, "", "/matsedel");
    expect(screen.queryByTestId("nav-timing")).not.toBeInTheDocument();
  });

  it("shows how long the switch took once the next page says it is ready", () => {
    saveOption("showTimings", true);
    const { rerender } = render(<NavTimingBadge />);
    act(() => tapLink("/matsedel?vecka=2026-W48"));
    pathname = "/matsedel";
    window.history.pushState({}, "", "/matsedel");
    rerender(
      <>
        <NavTimingBadge />
        <PageReady name="Matsedel" />
      </>,
    );
    expect(screen.getByTestId("nav-timing")).toHaveTextContent(/^Matsedel \d+ ms/);
  });
});
