import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwipeRow, swipeActionWidthPx } from "./swipe-row";

function setup() {
  const onAction = vi.fn();
  const onOpenItem = vi.fn();
  render(
    <>
      <SwipeRow actionLabel="Ta bort" actionName="Ta bort Mjölk" onAction={onAction}>
        <button type="button" onClick={onOpenItem}>
          Mjölk 1 l
        </button>
      </SwipeRow>
      <button type="button">Annat</button>
    </>,
  );
  const front = screen.getByTestId("swipe-row-front");
  const item = screen.getByRole("button", { name: "Mjölk 1 l" });
  const action = screen.getByRole("button", { name: "Ta bort Mjölk" });
  return { onAction, onOpenItem, front, item, action };
}

/** Drags from (x, y) by (dx, dy) in steps, as a finger or the mouse would, then lifts. */
function swipe(target: HTMLElement, dx: number, dy = 0, { pointerType = "touch", lift = "up" } = {}) {
  const start = { clientX: 200, clientY: 20, pointerId: 1, pointerType, button: 0, buttons: 1, isPrimary: true };
  fireEvent.pointerDown(target, start);
  for (const step of [0.25, 0.5, 1]) {
    fireEvent.pointerMove(target, { ...start, clientX: start.clientX + dx * step, clientY: start.clientY + dy * step });
  }
  const end = { ...start, clientX: start.clientX + dx, clientY: start.clientY + dy };
  if (lift === "up") fireEvent.pointerUp(target, end);
  else fireEvent.pointerCancel(target, end);
}

const isOpen = (front: HTMLElement) => front.style.transform === `translateX(-${swipeActionWidthPx}px)`;

describe("SwipeRow", () => {
  it("shows the row with the action hidden behind it, named for screen readers", () => {
    const { front, action } = setup();
    expect(action).toHaveTextContent("Ta bort");
    expect(front.style.transform).toBe("");
    expect(front).toHaveClass("touch-pan-y");
  });

  it("opens on a swipe to the left past half the action, and the action runs on a tap", () => {
    const { front, action, onAction, onOpenItem } = setup();
    swipe(front, -80);
    expect(isOpen(front)).toBe(true);
    fireEvent.click(action, { detail: 1 });
    expect(onAction).toHaveBeenCalledWith("pointer");
    expect(onOpenItem).not.toHaveBeenCalled();
    expect(isOpen(front)).toBe(false);
  });

  it("follows the pointer while dragging, never further than the action", () => {
    const { front } = setup();
    fireEvent.pointerDown(front, { clientX: 200, clientY: 20, pointerId: 1, pointerType: "touch", isPrimary: true, buttons: 1 });
    fireEvent.pointerMove(front, { clientX: 170, clientY: 21, pointerId: 1, pointerType: "touch", isPrimary: true, buttons: 1 });
    expect(front.style.transform).toBe("translateX(-30px)");
    // No animation while the pointer drags.
    expect(front.className).not.toContain("transition");
    fireEvent.pointerMove(front, { clientX: 0, clientY: 21, pointerId: 1, pointerType: "touch", isPrimary: true, buttons: 1 });
    expect(front.style.transform).toBe(`translateX(-${swipeActionWidthPx}px)`);
    fireEvent.pointerMove(front, { clientX: 260, clientY: 21, pointerId: 1, pointerType: "touch", isPrimary: true, buttons: 1 });
    expect(front.style.transform).toBe("");
  });

  it("slides back after a short swipe, and closes on a swipe to the right", () => {
    const { front } = setup();
    swipe(front, -30);
    expect(isOpen(front)).toBe(false);
    expect(front.style.transform).toBe("");
    swipe(front, -90);
    expect(isOpen(front)).toBe(true);
    swipe(front, 70);
    expect(isOpen(front)).toBe(false);
  });

  it("works with the mouse, but not with another button than the main one", () => {
    const { front } = setup();
    swipe(front, -80, 0, { pointerType: "mouse" });
    expect(isOpen(front)).toBe(true);
    swipe(front, 80, 0, { pointerType: "mouse" });
    fireEvent.pointerDown(front, { clientX: 200, clientY: 20, pointerId: 2, pointerType: "mouse", button: 2, buttons: 2, isPrimary: true });
    fireEvent.pointerMove(front, { clientX: 100, clientY: 20, pointerId: 2, pointerType: "mouse", button: 2, buttons: 2, isPrimary: true });
    fireEvent.pointerUp(front, { clientX: 100, clientY: 20, pointerId: 2, pointerType: "mouse", button: 2, buttons: 2, isPrimary: true });
    expect(isOpen(front)).toBe(false);
  });

  it("leaves a vertical move to the page's scroll", () => {
    const { front } = setup();
    swipe(front, -40, 120);
    expect(front.style.transform).toBe("");
    expect(isOpen(front)).toBe(false);
  });

  it("stays as it was when the browser cancels the swipe", () => {
    const { front } = setup();
    swipe(front, -80, 0, { lift: "cancel" });
    expect(isOpen(front)).toBe(false);
  });

  it("keeps the click that ends a swipe from opening the item", () => {
    const { front, item, onOpenItem } = setup();
    swipe(item, -80);
    fireEvent.click(item);
    expect(onOpenItem).not.toHaveBeenCalled();
    expect(isOpen(front)).toBe(true);
  });

  it("closes on a tap on the open row instead of opening the item, and opens the item on the next tap", () => {
    const { front, item, onOpenItem } = setup();
    swipe(front, -80);
    fireEvent.pointerDown(item, { pointerId: 3, pointerType: "touch", clientX: 50, clientY: 20, isPrimary: true });
    fireEvent.pointerUp(item, { pointerId: 3, pointerType: "touch", clientX: 50, clientY: 20, isPrimary: true });
    fireEvent.click(item);
    expect(onOpenItem).not.toHaveBeenCalled();
    expect(isOpen(front)).toBe(false);
    fireEvent.click(item);
    expect(onOpenItem).toHaveBeenCalledTimes(1);
  });

  it("closes when Pontus touches anything else", () => {
    const { front } = setup();
    swipe(front, -80);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Annat" }));
    expect(isOpen(front)).toBe(false);
  });

  it("reaches the action with the keyboard: focus opens the row, Esc or leaving closes it", () => {
    const { front, item, action, onAction } = setup();
    act(() => action.focus());
    expect(isOpen(front)).toBe(true);
    fireEvent.keyDown(action, { key: "Escape" });
    expect(isOpen(front)).toBe(false);
    // Focus goes back to the row, never stays on the covered action.
    expect(item).toHaveFocus();

    act(() => action.focus());
    act(() => screen.getByRole("button", { name: "Annat" }).focus());
    expect(isOpen(front)).toBe(false);

    act(() => action.focus());
    // Enter or Space: a click without a pointer.
    fireEvent.click(action, { detail: 0 });
    expect(onAction).toHaveBeenCalledWith("keyboard");
  });

  it("animates only when motion is allowed", () => {
    const { front } = setup();
    const classes = front.className.split(/\s+/).filter((name) => name.includes("transition") || name.includes("duration"));
    expect(classes.length).toBeGreaterThan(0);
    for (const name of classes) expect(name).toMatch(/^motion-safe:/);
  });

  it("follows one pointer at a time: a second finger neither starts nor takes over a swipe", () => {
    const { front } = setup();
    fireEvent.pointerDown(front, { clientX: 200, clientY: 20, pointerId: 1, pointerType: "touch", isPrimary: true });
    fireEvent.pointerDown(front, { clientX: 100, clientY: 20, pointerId: 2, pointerType: "touch", isPrimary: false });
    fireEvent.pointerMove(front, { clientX: 20, clientY: 20, pointerId: 2, pointerType: "touch", isPrimary: false });
    expect(front.style.transform).toBe("");
    fireEvent.pointerMove(front, { clientX: 170, clientY: 20, pointerId: 1, pointerType: "touch", isPrimary: true });
    expect(front.style.transform).toBe("translateX(-30px)");
    fireEvent.pointerUp(front, { clientX: 170, clientY: 20, pointerId: 1, pointerType: "touch", isPrimary: true });
    expect(front.style.transform).toBe("");

    // A secondary pointer alone does nothing either.
    fireEvent.pointerDown(front, { clientX: 200, clientY: 20, pointerId: 3, pointerType: "touch", isPrimary: false });
    fireEvent.pointerMove(front, { clientX: 50, clientY: 20, pointerId: 3, pointerType: "touch", isPrimary: false });
    fireEvent.pointerUp(front, { clientX: 50, clientY: 20, pointerId: 3, pointerType: "touch", isPrimary: false });
    expect(isOpen(front)).toBe(false);
  });

  it("lets go when the mouse button is no longer down, and rests where it was", () => {
    const { front } = setup();
    const mouse = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
    fireEvent.pointerDown(front, { ...mouse, clientX: 200, clientY: 20, buttons: 1 });
    fireEvent.pointerMove(front, { ...mouse, clientX: 120, clientY: 20, buttons: 1 });
    expect(front.style.transform).toBe("translateX(-80px)");
    // Released outside the window: the next move has no button down.
    fireEvent.pointerMove(front, { ...mouse, clientX: 110, clientY: 20, buttons: 0 });
    expect(front.style.transform).toBe("");
    expect(isOpen(front)).toBe(false);
    fireEvent.pointerUp(front, { ...mouse, clientX: 110, clientY: 20, buttons: 0 });
    expect(isOpen(front)).toBe(false);
  });

  it("resets the drag when a vertical move ends", () => {
    const { front } = setup();
    swipe(front, -6, 60);
    expect(front.style.transform).toBe("");
    // The next swipe starts afresh.
    swipe(front, -80);
    expect(isOpen(front)).toBe(true);
  });

  it("gives focus back past anything taken out of the tab order", () => {
    render(
      <SwipeRow actionLabel="Ta bort" actionName="Ta bort Smör" onAction={() => {}}>
        <span tabIndex={-1}>Smör</span>
        <button type="button">Smör 250 g</button>
      </SwipeRow>,
    );
    const action = screen.getByRole("button", { name: "Ta bort Smör" });
    act(() => action.focus());
    fireEvent.keyDown(action, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Smör 250 g" })).toHaveFocus();
  });
});
