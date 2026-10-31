import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import type { Thing } from "../domain/thing";
import { resetDeviceStore } from "./device-store";
import { RoomCategories } from "./room-categories";

const loadRoomCategoryThings = vi.fn();
vi.mock("../actions/room-things", () => ({ loadRoomCategoryThings: (input: unknown) => loadRoomCategoryThings(input) }));
vi.mock("../actions/thing-item", () => ({ renameThing: vi.fn(), removeThing: vi.fn(), restoreThing: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const site = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const wrench: Thing = { id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11", name: "Skiftnyckel", category: "Verktyg", whereHint: "väggen", confidence: "high", seenOn: 1 };
const categories = [
  { category: "Verktyg" as const, things: 214 },
  { category: "Trädgård" as const, things: 3 },
];

beforeEach(() => {
  window.localStorage.clear();
  resetDeviceStore();
  loadRoomCategoryThings.mockReset();
  loadRoomCategoryThings.mockResolvedValue(ok([wrench]));
});

const view = () =>
  render(
    <ToastProvider>
      <RoomCategories siteId={site} roomKey="skräpförrådet" categories={categories} />
    </ToastProvider>,
  );

describe("the room's categories", () => {
  it("are folded in with their count, and read nothing until one is opened", async () => {
    view();
    const toggle = screen.getByRole("button", { name: "Verktyg · 214" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Skiftnyckel")).not.toBeInTheDocument();
    expect(loadRoomCategoryThings).not.toHaveBeenCalled();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Skiftnyckel")).toBeInTheDocument();
    expect(screen.getByText("väggen")).toBeInTheDocument();
    expect(loadRoomCategoryThings).toHaveBeenCalledTimes(1);
    expect(loadRoomCategoryThings).toHaveBeenCalledWith({ siteId: site, roomKey: "skräpförrådet", category: "Verktyg" });
  });

  it("remember what is open on the device", async () => {
    const first = view();
    await userEvent.click(screen.getByRole("button", { name: "Verktyg · 214" }));
    await screen.findByText("Skiftnyckel");
    first.unmount();
    view();
    expect(screen.getByRole("button", { name: "Verktyg · 214" })).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Skiftnyckel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trädgård · 3" })).toHaveAttribute("aria-expanded", "false");
  });
});
