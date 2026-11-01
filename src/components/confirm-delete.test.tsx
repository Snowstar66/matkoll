import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cannotUndoText, useConfirmDelete } from "./confirm-delete";

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
});
