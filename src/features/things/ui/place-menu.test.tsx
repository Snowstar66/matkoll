import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import { PlaceMenu } from "./place-menu";

const removeThingPlace = vi.fn();
const renameThingPlace = vi.fn();
vi.mock("../actions/edit-place", () => ({
  removeThingPlace: (input: unknown) => removeThingPlace(input),
  renameThingPlace: (input: unknown) => renameThingPlace(input),
}));
const refresh = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace, push: vi.fn() }) }));
vi.mock("@/components/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const id = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a09";

beforeEach(() => {
  removeThingPlace.mockReset();
  renameThingPlace.mockReset();
  refresh.mockReset();
  replace.mockReset();
});

describe("PlaceMenu", () => {
  it("shows what goes before a removal, then removes and reads the page again", async () => {
    removeThingPlace.mockResolvedValue(ok({ counts: { things: 12, cards: 2 }, roomLeft: true }));
    render(<PlaceMenu placeId={id} part="Blå backen" box counts={{ things: 12, cards: 2 }} roomHasOthers />);
    await userEvent.click(screen.getByTestId("place-menu"));
    await userEvent.click(screen.getByTestId("place-remove"));
    expect(screen.getByTestId("place-remove-counts")).toHaveTextContent("Det här tas bort: 12 prylar, 2 kort.");
    await userEvent.click(screen.getByTestId("place-remove-confirm"));
    await waitFor(() => expect(removeThingPlace).toHaveBeenCalledWith({ placeId: id }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("goes back to Förråd when the room has no place left", async () => {
    removeThingPlace.mockResolvedValue(ok({ counts: { things: 0, cards: 0 }, roomLeft: false }));
    render(<PlaceMenu placeId={id} part="Hyllan" box={false} counts={{ things: 0, cards: 0 }} roomHasOthers={false} />);
    await userEvent.click(screen.getByTestId("place-menu"));
    await userEvent.click(screen.getByTestId("place-remove"));
    await userEvent.click(screen.getByTestId("place-remove-confirm"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/prylar"));
  });

  it("renames", async () => {
    renameThingPlace.mockResolvedValue(ok({ part: "Gröna backen" }));
    render(<PlaceMenu placeId={id} part="Blå backen" box counts={{ things: 0, cards: 0 }} roomHasOthers />);
    await userEvent.click(screen.getByTestId("place-menu"));
    await userEvent.click(screen.getByTestId("place-rename"));
    await userEvent.clear(screen.getByTestId("rename-name"));
    await userEvent.type(screen.getByTestId("rename-name"), "Gröna backen");
    await userEvent.click(screen.getByTestId("rename-save"));
    await waitFor(() => expect(renameThingPlace).toHaveBeenCalledWith({ placeId: id, name: "Gröna backen" }));
  });
});
