import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RenameSheet } from "./rename-sheet";

const props = { open: true, onClose: vi.fn(), title: "Byt namn på rummet", label: "Rummets namn", initial: "Garaget", confirmText: "Slå ihop rummen" };

describe("RenameSheet", () => {
  it("keeps Spara off until the name changes, then saves and closes", async () => {
    const submit = vi.fn().mockResolvedValue({ kind: "done" });
    const onClose = vi.fn();
    render(<RenameSheet {...props} onClose={onClose} submit={submit} />);
    expect(screen.getByTestId("rename-save")).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Rummets namn"));
    await userEvent.type(screen.getByLabelText("Rummets namn"), "Förrådet");
    await userEvent.click(screen.getByTestId("rename-save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith("Förrådet", false);
  });

  it("asks before merging and sends merge=true on the yes", async () => {
    const submit = vi.fn().mockResolvedValueOnce({ kind: "ask", question: "Vinden finns redan." }).mockResolvedValueOnce({ kind: "done" });
    render(<RenameSheet {...props} submit={submit} />);
    await userEvent.type(screen.getByLabelText("Rummets namn"), "x");
    await userEvent.click(screen.getByTestId("rename-save"));
    expect(await screen.findByText("Vinden finns redan.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Slå ihop rummen" }));
    await waitFor(() => expect(submit).toHaveBeenLastCalledWith("Garagetx", true));
  });

  it("shows an error on the field", async () => {
    const submit = vi.fn().mockResolvedValue({ kind: "error", message: "Det finns redan en plats med det namnet i rummet.", field: true });
    render(<RenameSheet {...props} submit={submit} />);
    await userEvent.type(screen.getByLabelText("Rummets namn"), "x");
    await userEvent.click(screen.getByTestId("rename-save"));
    expect(await screen.findByText("Det finns redan en plats med det namnet i rummet.")).toBeInTheDocument();
  });
});
