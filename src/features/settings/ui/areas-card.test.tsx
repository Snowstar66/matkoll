import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOption } from "@/lib/options";
import { AreasCard } from "./areas-card";
import { OptionSettings } from "./option-settings";

const toast = vi.hoisted(() => ({ showToast: vi.fn(), dismissToast: vi.fn() }));
vi.mock("@/components/toast", () => ({ useToast: () => toast }));

beforeEach(() => {
  localStorage.clear();
  toast.showToast.mockClear();
});

describe("AreasCard", () => {
  it("shows five boxes, the two buttons and the note, with no box set at first apart from Laga mat (half)", async () => {
    render(<AreasCard />);
    expect(screen.getByRole("heading", { name: "Vad vill du ha hjälp med?" })).toBeInTheDocument();
    expect(await screen.findByTestId("area-cook")).toHaveAttribute("aria-checked", "mixed");
    for (const id of ["plan", "nutrition", "ute", "things"]) expect(screen.getByTestId(`area-${id}`)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Bara grunderna" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allt" })).toBeInTheDocument();
    expect(screen.getByTestId("areas-note")).toHaveTextContent("Reglagen gäller bara den här telefonen. Delningen längst ned gäller hela hushållet.");
  });

  it("a tap works at once, the toast says what happened, and Ångra puts the switches back", async () => {
    render(<AreasCard />);
    await userEvent.click(await screen.findByTestId("area-plan"));
    expect(readOption("weekAgent")).toBe(true);
    expect(toast.showToast).toHaveBeenCalledWith("Planera veckan på. Slog på 3.", expect.objectContaining({ onUndo: expect.any(Function) }));
    expect(screen.getByTestId("area-plan")).toHaveAttribute("aria-checked", "true");
    toast.showToast.mock.calls[0]![1].onUndo();
    expect(readOption("weekAgent")).toBe(false);
  });

  it("Bara grunderna leaves the empty note, and the box follows a switch changed by hand", async () => {
    render(<AreasCard />);
    await userEvent.click(screen.getByRole("button", { name: "Bara grunderna" }));
    expect(toast.showToast).toHaveBeenCalledWith("Bara grunderna. Stängde 3.", expect.anything());
    expect(screen.getByTestId("areas-note")).toHaveTextContent("Inget är påslaget. Recept och Matsedel visar bara det grundläggande. Slå på ett område ovan.");
    await userEvent.click(screen.getByRole("button", { name: "Allt" }));
    expect(screen.getByTestId("area-ute")).toHaveAttribute("aria-checked", "true");
  });

  it("is not drawn at all when the feature is off, and Tillval then keeps its old note", () => {
    const { container } = render(<AreasCard enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    render(<OptionSettings areasEnabled={false} />);
    expect(screen.queryByTestId("areas-card")).not.toBeInTheDocument();
    expect(screen.getByText("Gäller bara den här enheten.")).toBeInTheDocument();
  });

  it("is the first thing in Tillval when on, in place of the old note", () => {
    render(<OptionSettings areasEnabled />);
    expect(screen.getByTestId("areas-card")).toBeInTheDocument();
    expect(screen.queryByText("Gäller bara den här enheten.")).not.toBeInTheDocument();
  });
});
