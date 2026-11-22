import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRemovedThing, dismissRemovedThing, hasRemovedThingsHost, RemovedThingRow, undoWindowMs, useRemovedThings, useRemovedThingsHost } from "./removed-things";

const id = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";

function Host() {
  useRemovedThingsHost();
  const removed = useRemovedThings();
  return (
    <ul>
      {removed.map((thing) => (
        <RemovedThingRow key={thing.id} thing={thing} />
      ))}
    </ul>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  dismissRemovedThing(id);
  vi.useRealTimers();
});

describe("a removed föremål's row", () => {
  it("shows the name struck through with Ångra and the seconds left, and goes after the undo window", () => {
    render(<Host />);
    expect(hasRemovedThingsHost()).toBe(true);
    act(() => addRemovedThing({ id, name: "Gammal kamera", photoId: null, category: "Elektronik", noted: false, undo: vi.fn() }));
    expect(screen.getByTestId("thing-removed")).toHaveTextContent("Gammal kamera");
    expect(screen.getByTestId("thing-removed")).toHaveTextContent(/borttagen/);
    expect(screen.getByRole("button", { name: "Ångra: Gammal kamera" })).toHaveTextContent("6 s");
    act(() => {
      vi.advanceTimersByTime(undoWindowMs + 50);
    });
    expect(screen.queryByTestId("thing-removed")).toBeNull();
  });

  it("puts the föremål back when Ångra is tapped, and the row goes at once", async () => {
    const undo = vi.fn();
    render(<Host />);
    act(() => addRemovedThing({ id, name: "Gammal kamera", photoId: null, category: "Elektronik", noted: false, undo }));
    await userEvent.click(screen.getByRole("button", { name: /Ångra/ }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("thing-removed")).toBeNull();
  });

  it("has no host when no list is mounted, so the sheet falls back to the toast", () => {
    expect(hasRemovedThingsHost()).toBe(false);
  });
});
