import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { SavedBoxThings } from "../actions/save-box-things";
import { BoxThings } from "./box-things";

const saveBoxThings = vi.fn<(input: { placeId: string; text: string }) => Promise<Result<SavedBoxThings>>>();
vi.mock("../actions/save-box-things", () => ({ saveBoxThings: (input: { placeId: string; text: string }) => saveBoxThings(input) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";

beforeEach(() => {
  saveBoxThings.mockReset();
  refresh.mockReset();
});

function renderIt(extra: { initialText?: string; photographed?: number } = {}) {
  render(<BoxThings placeId={placeId} room="Skräpförrådet" roomHref="/prylar/rum/s/skräpförrådet" initialText="" photographed={0} {...extra} />);
}

describe("Skriv vad som finns", () => {
  it("has the field, its hint, 'Spara' and the way to photograph the inside instead", () => {
    renderIt();
    expect(screen.getByText("Låda i Skräpförrådet")).toBeInTheDocument();
    expect(screen.getByLabelText("Vad finns i lådan?")).toBeInTheDocument();
    expect(screen.getByText("En sak per rad eller med komma. Livskoll sorterar i kategorier.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spara" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fota insidan i stället/ })).toHaveAttribute("href", `/prylar/rum/s/skräpförrådet?fota=${placeId}`);
    expect(screen.queryByText(/från kort/)).not.toBeInTheDocument();
  });

  it("shows what is written, and says how many things the cards show as well", () => {
    renderIt({ initialText: "Glitter\nTång", photographed: 12 });
    expect(screen.getByLabelText("Vad finns i lådan?")).toHaveValue("Glitter\nTång");
    expect(screen.getByText("Dessutom 12 föremål från kort.")).toBeInTheDocument();
  });

  it("saves the text, shows it as stored and says how many things were saved", async () => {
    saveBoxThings.mockResolvedValue(ok({ count: 2, categorized: true, text: "Glitter\nTång" }));
    renderIt();
    await userEvent.type(screen.getByLabelText("Vad finns i lådan?"), "glitter, tång");
    await userEvent.click(screen.getByRole("button", { name: "Spara" }));
    expect(saveBoxThings).toHaveBeenCalledWith({ placeId, text: "glitter, tång" });
    expect(await screen.findByText("Sparat: 2 föremål")).toBeInTheDocument();
    expect(screen.getByLabelText("Vad finns i lådan?")).toHaveValue("Glitter\nTång");
    expect(refresh).toHaveBeenCalled();
  });

  it("says when the things were saved without categories", async () => {
    saveBoxThings.mockResolvedValue(ok({ count: 1, categorized: false, text: "Glitter" }));
    renderIt();
    await userEvent.type(screen.getByLabelText("Vad finns i lådan?"), "glitter");
    await userEvent.click(screen.getByRole("button", { name: "Spara" }));
    expect(await screen.findByText(/Sparat, men utan kategorier/)).toBeInTheDocument();
  });

  it("says a text the action refuses under the field, and a failure at the top", async () => {
    saveBoxThings.mockResolvedValueOnce(fail("validation", { text: "Du kan skriva högst 100 föremål i en låda." }));
    renderIt();
    await userEvent.type(screen.getByLabelText("Vad finns i lådan?"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Spara" }));
    expect(await screen.findByText("Du kan skriva högst 100 föremål i en låda.")).toBeInTheDocument();
    saveBoxThings.mockResolvedValueOnce(fail("things_place_failed"));
    await userEvent.click(screen.getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(screen.getByText("Det gick inte att spara. Försök igen.")).toBeInTheDocument());
  });
});
