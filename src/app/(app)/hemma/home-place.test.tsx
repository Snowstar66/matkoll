import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantryDataError } from "@/features/pantry/server";
import { HomePlace } from "./home-place";

// Hemma when its places cannot be shown (Story 8.2): no switch, no "+", and
// the blue notice pantry_unavailable, with the reason in the log.

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
const listPantrySitesWithCounts = vi.fn();
vi.mock("@/features/pantry/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pantry/server")>()),
  listPantrySitesWithCounts: () => listPantrySitesWithCounts(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const searchParams = (plats?: string) => Promise.resolve(plats ? { plats } : {});

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
  listPantrySitesWithCounts.mockReset();
});

describe("HomePlace without places to show", () => {
  it("shows pantry_unavailable without a switch or + when the places cannot be read", async () => {
    listPantrySitesWithCounts.mockRejectedValue(new PantryDataError("query_failed 08006"));
    render(await HomePlace({ searchParams: searchParams("frys") } as Parameters<typeof HomePlace>[0]));
    expect(screen.getByRole("heading", { level: 1, name: "Matvaror" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa matvarorna. Försök igen.");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lägg till vara" })).toBeNull();
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 08006" });
  });

  it("shows pantry_unavailable when the user has no selected place, and logs why", async () => {
    listPantrySitesWithCounts.mockResolvedValue([]);
    render(await HomePlace({ searchParams: searchParams() } as Parameters<typeof HomePlace>[0]));
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa matvarorna. Försök igen.");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "no_selected_site" });
  });

  it("lets other errors through to the error boundary", async () => {
    listPantrySitesWithCounts.mockRejectedValue(new Error("boom"));
    await expect(HomePlace({ searchParams: searchParams() } as Parameters<typeof HomePlace>[0])).rejects.toThrow("boom");
  });
});
