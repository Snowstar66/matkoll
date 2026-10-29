import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteGraceMs,
  isDeleteGraceActive,
  resetDeleteGrace,
  startDeleteGrace,
  useConfirmDelete,
} from "./confirm-delete";

const deleted = vi.fn();

function Harness() {
  const { requestDelete, dialog } = useConfirmDelete();
  return (
    <>
      {["Mjölk", "Ägg"].map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => requestDelete({ question: `Ta bort ${name} från inköpslistan?`, onConfirm: () => deleted(name) })}
        >
          {`Bin ${name}`}
        </button>
      ))}
      {dialog}
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  resetDeleteGrace();
  deleted.mockClear();
});
afterEach(() => vi.useRealTimers());

const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));

describe("useConfirmDelete", () => {
  it("asks first and deletes only after Ta bort", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Mjölk"));
    expect(screen.getByText("Ta bort Mjölk från inköpslistan?")).toBeInTheDocument();
    expect(deleted).not.toHaveBeenCalled();
    confirm();
    expect(deleted).toHaveBeenCalledWith("Mjölk");
  });

  it("does not start the window on Avbryt", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Mjölk"));
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(deleted).not.toHaveBeenCalled();
    expect(isDeleteGraceActive()).toBe(false);
  });

  it("deletes at once inside the window, restarting it each time, and asks again after it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Mjölk"));
    confirm();
    act(() => void vi.advanceTimersByTime(deleteGraceMs - 1000));
    fireEvent.click(screen.getByText("Bin Ägg"));
    expect(deleted).toHaveBeenLastCalledWith("Ägg");
    act(() => void vi.advanceTimersByTime(deleteGraceMs - 1000));
    expect(isDeleteGraceActive()).toBe(true);
    act(() => void vi.advanceTimersByTime(1000));
    expect(isDeleteGraceActive()).toBe(false);
    deleted.mockClear();
    fireEvent.click(screen.getByText("Bin Mjölk"));
    expect(deleted).not.toHaveBeenCalled();
    expect(screen.getByText("Ta bort Mjölk från inköpslistan?")).toBeInTheDocument();
  });

  it("shares the window app-wide", () => {
    startDeleteGrace();
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Ägg"));
    expect(deleted).toHaveBeenCalledWith("Ägg");
  });
});
