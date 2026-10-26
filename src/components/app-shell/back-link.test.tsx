import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackLink } from "./back-link";
import { noteInAppNavigation, resetInAppHistory } from "./in-app-history";

// BackLink (Story 11.6): back in history within Matkoll, else the fallback.

const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }));

afterEach(() => {
  back.mockReset();
  resetInAppHistory();
});

function clickBack(init?: MouseEventInit) {
  const link = screen.getByRole("link", { name: "Tillbaka" });
  // fireEvent returns false when a handler called preventDefault.
  return fireEvent.click(link, { button: 0, ...init });
}

describe("BackLink", () => {
  it("is a link to the fallback page", () => {
    render(<BackLink fallbackHref="/recept">Tillbaka</BackLink>);
    expect(screen.getByRole("link", { name: "Tillbaka" })).toHaveAttribute("href", "/recept");
  });

  it("follows the link when the page was not reached within Matkoll", () => {
    render(<BackLink fallbackHref="/recept">Tillbaka</BackLink>);
    clickBack();
    expect(back).not.toHaveBeenCalled();
  });

  it("goes back in history after a navigation within Matkoll", () => {
    noteInAppNavigation();
    render(<BackLink fallbackHref="/recept">Tillbaka</BackLink>);
    expect(clickBack()).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("leaves a click with a modifier key to the browser", () => {
    noteInAppNavigation();
    render(<BackLink fallbackHref="/recept">Tillbaka</BackLink>);
    clickBack({ metaKey: true });
    expect(back).not.toHaveBeenCalled();
  });
});
