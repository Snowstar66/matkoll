import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cannotUndoText, deleteGraceMs, isDeleteGraceActive, startDeleteGrace, useConfirmDelete } from "./confirm-delete";

const deleted = vi.fn();

function Harness() {
  const { requestDelete, dialog } = useConfirmDelete();
  return (
    <>
      {["Lasagne", "Pannkakor"].map((name) => (
        <button key={name} type="button" onClick={() => requestDelete({ question: `Ta bort ${name}?`, onConfirm: () => deleted(name) })}>
          {`Bin ${name}`}
        </button>
      ))}
      {dialog}
    </>
  );
}

beforeEach(() => deleted.mockClear());

describe("useConfirmDelete (Story 19.4)", () => {
  it("is a question sheet: the question is the title, the consequence stands under it, and only Ta bort deletes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Lasagne"));
    const dialog = screen.getByRole("dialog", { name: "Ta bort Lasagne?" });
    expect(dialog).toHaveTextContent(cannotUndoText);
    expect(deleted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(deleted).toHaveBeenCalledWith("Lasagne");
  });

  it("keeps the thing when Avbryt is pressed", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Pannkakor"));
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(deleted).not.toHaveBeenCalled();
  });

  it("asks every time, with no window that skips the question", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Lasagne"));
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    fireEvent.click(screen.getByText("Bin Pannkakor"));
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Ta bort Pannkakor?" })).toBeInTheDocument();
  });

  it("takes its own button labels, e.g. Kasta and Fortsätt fota", () => {
    function Labelled() {
      const { requestDelete, dialog } = useConfirmDelete();
      return (
        <>
          <button type="button" onClick={() => requestDelete({ question: "Kasta 3 kort?", confirmLabel: "Kasta", cancelLabel: "Fortsätt fota", onConfirm: () => deleted("kort") })}>
            Avbryt kamera
          </button>
          {dialog}
        </>
      );
    }
    render(<Labelled />);
    fireEvent.click(screen.getByText("Avbryt kamera"));
    expect(screen.queryByRole("button", { name: "Avbryt" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fortsätt fota" }));
    expect(deleted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Avbryt kamera"));
    fireEvent.click(screen.getByRole("button", { name: "Kasta" }));
    expect(deleted).toHaveBeenCalledWith("kort");
  });

  it("without a graceKey never opens a window, whatever another key does", () => {
    startKeyElsewhere();
    render(<Harness />);
    fireEvent.click(screen.getByText("Bin Lasagne"));
    expect(screen.getByRole("dialog", { name: "Ta bort Lasagne?" })).toBeInTheDocument();
  });
});

function startKeyElsewhere() {
  startDeleteGrace("elsewhere");
}

describe("useConfirmDelete with a graceKey (Inköpslistan)", () => {
  function Graced({ graceKey }: { graceKey: string }) {
    const { requestDelete, dialog } = useConfirmDelete({ graceKey });
    return (
      <>
        <button type="button" onClick={() => requestDelete({ question: "Ta bort Mjölk?", onConfirm: () => deleted("Mjölk") })}>
          Bin
        </button>
        {dialog}
      </>
    );
  }

  it("has no cannot-undo line, and the window is per key", () => {
    render(<Graced graceKey="a" />);
    fireEvent.click(screen.getByText("Bin"));
    expect(screen.getByRole("dialog", { name: "Ta bort Mjölk?" })).not.toHaveTextContent(cannotUndoText);
    fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(isDeleteGraceActive("a")).toBe(true);
    expect(isDeleteGraceActive("b")).toBe(false);
  });

  it("deletes at once inside the window and asks again after it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      render(<Graced graceKey="a" />);
      fireEvent.click(screen.getByText("Bin"));
      fireEvent.click(screen.getByRole("button", { name: "Ta bort" }));
      vi.setSystemTime(Date.now() + deleteGraceMs - 1);
      fireEvent.click(screen.getByText("Bin"));
      expect(deleted).toHaveBeenCalledTimes(2);
      vi.setSystemTime(Date.now() + deleteGraceMs + 1);
      fireEvent.click(screen.getByText("Bin"));
      expect(deleted).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
