import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import { AddBox } from "./add-box";

const createThingBox = vi.fn<(input: { placeId: string; name: string }) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/create-box", () => ({ createThingBox: (input: { placeId: string; name: string }) => createThingBox(input) }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";
const boxId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";

beforeEach(() => {
  createThingBox.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("Lägg till låda", () => {
  it("adds the box and opens its page with the camera ready", async () => {
    createThingBox.mockResolvedValue(ok({ id: boxId }));
    render(<AddBox placeId={placeId} variant="button" />);
    await userEvent.click(screen.getByRole("button", { name: "Lägg till låda" }));
    await userEvent.type(screen.getByLabelText("Namn på lådan"), "Blå backen");
    await userEvent.click(screen.getByRole("button", { name: "Lägg till och fota" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/prylar/${boxId}?fota=1`));
    expect(createThingBox).toHaveBeenCalledWith({ placeId, name: "Blå backen" });
  });

  it("opens from the line about the closed boxes", async () => {
    render(<AddBox placeId={placeId} variant="row" label="Innehållet i 3 lådor syns inte – fota insidan" />);
    await userEvent.click(screen.getByRole("button", { name: "Innehållet i 3 lådor syns inte – fota insidan" }));
    expect(screen.getByRole("dialog", { name: "Lägg till låda" })).toBeInTheDocument();
  });

  it("says an empty name and a taken one under the field", async () => {
    createThingBox.mockResolvedValue(fail("things_place_taken", { name: "Lådan finns redan." }));
    render(<AddBox placeId={placeId} variant="button" />);
    await userEvent.click(screen.getByRole("button", { name: "Lägg till låda" }));
    await userEvent.click(screen.getByRole("button", { name: "Lägg till och fota" }));
    expect(screen.getByText("Ange ett namn, till exempel Blå backen.")).toBeInTheDocument();
    expect(createThingBox).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Namn på lådan"), "Blå backen");
    await userEvent.click(screen.getByRole("button", { name: "Lägg till och fota" }));
    expect(await screen.findByText("Lådan finns redan.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
