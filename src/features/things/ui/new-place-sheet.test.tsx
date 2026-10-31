import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import { NewPlace } from "./new-place-sheet";

const createThingPlace = vi.fn<(input: { siteId: string; room: string; part: string }) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/create-place", () => ({ createThingPlace: (input: { siteId: string; room: string; part: string }) => createThingPlace(input) }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";

beforeEach(() => {
  createThingPlace.mockReset();
  push.mockReset();
  refresh.mockReset();
});

async function open(variant: "icon" | "primary" | "text" = "primary") {
  render(<NewPlace siteId={siteId} rooms={["Garaget", "Skräpförrådet"]} variant={variant} />);
  await userEvent.click(screen.getByRole("button", { name: "Ny plats" }));
  return screen.getByRole("dialog", { name: "Ny plats" });
}

describe("Ny plats", () => {
  it("opens a sheet with a room field that suggests the rooms the user has, and an optional part", async () => {
    const dialog = await open();
    expect(dialog.querySelector("input[name=room]")).toHaveAttribute("list");
    const list = dialog.querySelector("datalist")!;
    expect([...list.querySelectorAll("option")].map((option) => option.value)).toEqual(["Garaget", "Skräpförrådet"]);
    expect(screen.getByLabelText("Del (valfritt)")).toBeInTheDocument();
  });

  it("has the round plus in the header with the same name", async () => {
    await open("icon");
    expect(screen.getByLabelText("Rum")).toBeInTheDocument();
  });

  it("creates the place for the boende the page shows and opens it", async () => {
    createThingPlace.mockResolvedValue(ok({ id: placeId }));
    await open();
    await userEvent.type(screen.getByLabelText("Rum"), "Skräpförrådet");
    await userEvent.type(screen.getByLabelText("Del (valfritt)"), "Översta hyllan");
    await userEvent.click(screen.getByRole("button", { name: "Skapa" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/prylar/${placeId}`));
    expect(createThingPlace).toHaveBeenCalledWith({ siteId, room: "Skräpförrådet", part: "Översta hyllan" });
  });

  it("says an empty room under its field without asking the server", async () => {
    await open();
    fireEvent.submit(screen.getByLabelText("Rum").closest("form")!);
    expect(await screen.findByText("Ange ett rum, till exempel Skräpförrådet.")).toBeInTheDocument();
    expect(createThingPlace).not.toHaveBeenCalled();
  });

  it("says a taken place under the room field and stays open", async () => {
    createThingPlace.mockResolvedValue(fail("things_place_taken", { room: "Platsen finns redan." }));
    await open();
    await userEvent.type(screen.getByLabelText("Rum"), "Garaget");
    await userEvent.click(screen.getByRole("button", { name: "Skapa" }));
    expect(await screen.findByText("Platsen finns redan.")).toBeInTheDocument();
    expect(screen.getByLabelText("Rum")).toHaveAttribute("aria-invalid", "true");
    expect(push).not.toHaveBeenCalled();
  });

  it("says a failure at the top, and reads the page again when the boende is gone", async () => {
    createThingPlace.mockResolvedValue(fail("things_place_gone"));
    await open();
    await userEvent.type(screen.getByLabelText("Rum"), "Garaget");
    await userEvent.click(screen.getByRole("button", { name: "Skapa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Platsen finns inte längre.");
    expect(refresh).toHaveBeenCalled();
  });

  it("reads the page again when no answer came, since the place may be saved", async () => {
    createThingPlace.mockRejectedValue(new Error("offline"));
    await open();
    await userEvent.type(screen.getByLabelText("Rum"), "Garaget");
    await userEvent.click(screen.getByRole("button", { name: "Skapa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara platsen");
    expect(refresh).toHaveBeenCalled();
  });
});
