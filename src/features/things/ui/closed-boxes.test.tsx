import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { ClosedBox } from "../domain/thing-closed";
import { ClosedBoxes } from "./closed-boxes";

const createThingBox = vi.fn<(input: { placeId: string; name: string }) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/create-box", () => ({ createThingBox: (input: { placeId: string; name: string }) => createThingBox(input) }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";
const boxId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";

const boxes: ClosedBox[] = [
  { id: "a", name: "Blå låda", whereHint: "översta hyllan", cardId: "c1", takenAt: "2026-10-31T10:00:00.000Z", box: { left: 0.1, top: 0.2, width: 0.2, height: 0.4 }, photoWidth: 1000, photoHeight: 500 },
  { id: "b", name: "Röd back", whereHint: null, cardId: "c1", takenAt: "2026-10-31T10:00:00.000Z", box: null, photoWidth: 0, photoHeight: 0 },
];

beforeEach(() => {
  createThingBox.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("Lådor där innehållet inte syns", () => {
  it("says how many in a plain row, and lists exactly those boxes in a sheet", async () => {
    render(<ClosedBoxes placeId={placeId} roomHref="/prylar/rum/site/garaget" boxes={boxes} />);
    await userEvent.click(screen.getByRole("button", { name: "2 lådor där innehållet inte syns" }));
    const dialog = screen.getByRole("dialog", { name: "Lådor där innehållet inte syns" });
    expect(within(dialog).getByText("Fota insidan så vet du vad som finns i dem.")).toBeInTheDocument();
    const rows = within(dialog).getAllByTestId("closed-box");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Blå låda")).toBeInTheDocument();
    expect(within(rows[0]).getByText("översta hyllan · Kort från 31 okt")).toBeInTheDocument();
    expect(rows[0].querySelector("img")).toHaveAttribute("src", "/api/things/photo/c1");
  });

  it("makes the box and opens the room with its camera ready", async () => {
    createThingBox.mockResolvedValue(ok({ id: boxId }));
    render(<ClosedBoxes placeId={placeId} roomHref="/prylar/rum/site/garaget" boxes={boxes} />);
    await userEvent.click(screen.getByRole("button", { name: "2 lådor där innehållet inte syns" }));
    await userEvent.click(screen.getByRole("button", { name: "Fota insidan: Blå låda" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/prylar/rum/site/garaget?fota=${boxId}`));
    expect(createThingBox).toHaveBeenCalledWith({ placeId, name: "Blå låda" });
  });

  it("says a box that exists already, and stays", async () => {
    createThingBox.mockResolvedValue(fail("things_place_taken", { name: "Lådan finns redan." }));
    render(<ClosedBoxes placeId={placeId} roomHref="/prylar/rum/site/garaget" boxes={boxes} />);
    await userEvent.click(screen.getByRole("button", { name: "2 lådor där innehållet inte syns" }));
    await userEvent.click(screen.getByRole("button", { name: "Fota insidan: Röd back" }));
    expect(await screen.findByText("Lådan finns redan.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
