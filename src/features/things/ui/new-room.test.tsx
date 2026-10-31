import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { NewRoom } from "./new-room";

const ensureCapturePlace = vi.fn();
vi.mock("../actions/capture-place", () => ({ ensureCapturePlace: (input: unknown) => ensureCapturePlace(input) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const site = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";

beforeEach(() => {
  ensureCapturePlace.mockReset();
  push.mockReset();
});

describe("+ Nytt rum", () => {
  it("asks for the room's name in a sheet, with the field focused", async () => {
    render(<NewRoom siteId={site} />);
    await userEvent.click(screen.getByRole("button", { name: "Nytt rum" }));
    expect(screen.getByRole("dialog", { name: "Nytt rum" })).toBeInTheDocument();
    expect(screen.getByLabelText("Namn på rummet")).toHaveFocus();
    expect(screen.getByText("Sedan fotar du rummet, en hylla eller en låda där.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skapa rum" })).toBeInTheDocument();
  });

  it("makes the room as a whole-room place and opens its page", async () => {
    ensureCapturePlace.mockResolvedValue(ok({ placeId: "p1" }));
    render(<NewRoom siteId={site} />);
    await userEvent.click(screen.getByRole("button", { name: "Nytt rum" }));
    await userEvent.type(screen.getByLabelText("Namn på rummet"), "Vinden{Enter}");
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/prylar/rum/${site}/vinden`));
    expect(ensureCapturePlace).toHaveBeenCalledWith({ siteId: site, room: "Vinden", part: "", box: false });
  });

  it("says an empty name under the field and goes nowhere", async () => {
    ensureCapturePlace.mockResolvedValue(fail("validation", { room: "Ange ett rum, till exempel Skräpförrådet." }));
    render(<NewRoom siteId={site} />);
    await userEvent.click(screen.getByRole("button", { name: "Nytt rum" }));
    await userEvent.click(screen.getByRole("button", { name: "Skapa rum" }));
    expect(await screen.findByText("Ange ett rum, till exempel Skräpförrådet.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
