import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartRedirect } from "./start-redirect";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  replace.mockReset();
  window.location.hash = "";
});

describe("StartRedirect (Story 14.7)", () => {
  it("sends an old anchor to the page that holds it", () => {
    window.location.hash = "#spara-i-matkoll";
    render(<StartRedirect />);
    expect(replace).toHaveBeenCalledWith("/installningar/spara-i-matkoll");
  });

  it("does nothing without an anchor, or with an unknown one", () => {
    render(<StartRedirect />);
    window.location.hash = "#nope";
    render(<StartRedirect />);
    expect(replace).not.toHaveBeenCalled();
  });
});
