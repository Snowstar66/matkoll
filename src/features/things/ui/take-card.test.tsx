import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { resetDeviceStore } from "./device-store";
import { TakeCard } from "./take-card";

const ensureCapturePlace = vi.fn();
vi.mock("../actions/capture-place", () => ({ ensureCapturePlace: (input: unknown) => ensureCapturePlace(input) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const send = vi.fn();
vi.mock("./use-card-upload", () => ({
  useCardUpload: () => ({ state: { kind: "idle" }, send: (files: File[], target: unknown) => send(files, target), clear: vi.fn(), setState: vi.fn() }),
}));
vi.mock("@/lib/ai-jobs-client", () => ({ useShowingAiResults: () => {}, useOnAiJobsFinished: () => {} }));

const site = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const place = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";

beforeEach(() => {
  window.localStorage.clear();
  resetDeviceStore();
  ensureCapturePlace.mockReset();
  send.mockReset();
});

const view = (props: Partial<Parameters<typeof TakeCard>[0]> = {}) =>
  render(<TakeCard siteId={site} rooms={["Skräpförrådet", "Garaget"]} variant="primary" title="Ta kort" sub="Fota ett rum, en hylla eller en låda" {...props} />);

async function pick(files: File[]) {
  const input = document.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
  await userEvent.upload(input, files);
}

describe("Ta kort", () => {
  it("asks where, with the first room chosen and the exact place folded in", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: /Ta kort/ }));
    const dialog = screen.getByRole("dialog", { name: "Var tar du kortet?" });
    expect(screen.getByRole("radio", { name: "Skräpförrådet" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "+ Nytt rum" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /Mer exakt plats \(valfritt\)/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Välj bilder …" })).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("sends each chosen image as a card of the room, to the whole room without a part, and remembers the room", async () => {
    ensureCapturePlace.mockResolvedValue(ok({ placeId: place }));
    send.mockResolvedValue(2);
    view();
    await userEvent.click(screen.getByRole("button", { name: /Ta kort/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Garaget" }));
    // The click opens the picker; the chosen files are what matters here.
    await userEvent.click(screen.getByRole("button", { name: "Välj bilder …" }));
    const files = [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })];
    await pick(files);
    await waitFor(() => expect(send).toHaveBeenCalledWith(files, { placeId: place }));
    expect(ensureCapturePlace).toHaveBeenCalledWith({ siteId: site, room: "Garaget", part: "", box: false });
    expect(window.localStorage.getItem(`matkoll.prylar.rum.${site}`)).toBe("Garaget");
  });

  it("preselects the last used room next time, and a new room needs a name", async () => {
    window.localStorage.setItem(`matkoll.prylar.rum.${site}`, "garaget");
    view();
    await userEvent.click(screen.getByRole("button", { name: /Ta kort/ }));
    expect(screen.getByRole("radio", { name: "Garaget" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "+ Nytt rum" }));
    await userEvent.click(screen.getByRole("button", { name: "Välj bilder …" }));
    expect(screen.getByText("Ange ett rum, till exempel Skräpförrådet.")).toBeInTheDocument();
  });

  it("says a place that could not be made, and sends nothing", async () => {
    ensureCapturePlace.mockResolvedValue(fail("things_place_limit", { room: "Du kan ha högst 60 platser i ett boende." }));
    view();
    await userEvent.click(screen.getByRole("button", { name: /Ta kort/ }));
    await userEvent.click(screen.getByRole("button", { name: "Välj bilder …" }));
    await pick([new File(["a"], "a.jpg", { type: "image/jpeg" })]);
    expect(await screen.findByText("Du kan ha högst 60 platser i ett boende.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });
});
