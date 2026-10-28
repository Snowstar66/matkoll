import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WarmAi } from "./warm-ai";

// Story 12.2: the page asks the server to wake the model when it is shown,
// once per kind in five minutes, and shows nothing.

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const kinds = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).kind);

describe("WarmAi", () => {
  it("asks for its kind once when shown, also in StrictMode, and renders nothing", async () => {
    const { container } = render(
      <StrictMode>
        <WarmAi kind="image" />
      </StrictMode>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/warm");
    expect(kinds()).toEqual(["image"]);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not ask again when the page is shown again within five minutes", async () => {
    const first = render(<WarmAi kind="text" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<WarmAi kind="text" />);
    render(<WarmAi kind="image" />);
    await waitFor(() => expect(kinds()).toEqual(["text", "image"]));
  });
});
