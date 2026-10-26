import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { listStores, SettingsDataError } from "@/features/settings/server";
import { StoreContent } from "./store-content";

const requireUserOrRedirect = vi.fn(async (next: string) => ({ id: "user", next }));
vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: (next: string) => requireUserOrRedirect(next) }));
vi.mock("@/features/settings/server", () => ({
  SettingsDataError: class SettingsDataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
  listStores: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/settings/actions/select-store", () => ({ selectStore: vi.fn() }));
vi.mock("@/features/settings/actions/save-store", () => ({ saveStore: vi.fn() }));

beforeEach(() => {
  vi.mocked(listStores).mockReset();
  requireUserOrRedirect.mockClear();
});

describe("StoreContent", () => {
  it("shows the stores after checking the session", async () => {
    vi.mocked(listStores).mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Maxi ICA Stormarknad Östersund",
        chain: "ICA",
        externalStoreId: "1003733",
        address: null,
        url: null,
        isSelected: true,
      },
    ]);
    render(<ToastProvider>{await StoreContent()}</ToastProvider>);
    expect(requireUserOrRedirect).toHaveBeenCalledWith("/installningar");
    expect(screen.getByRole("heading", { level: 3, name: "Maxi ICA Stormarknad Östersund" })).toBeInTheDocument();
  });

  it("shows settings_store_unavailable in the section and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listStores).mockRejectedValue(new SettingsDataError("query_failed 08006"));
    render(await StoreContent());
    expect(screen.getByRole("heading", { level: 2, name: "Butik" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa butiken. Försök igen.");
    expect(log).toHaveBeenCalledWith("settings_store_unavailable", { reason: "query_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    vi.mocked(listStores).mockRejectedValue(new TypeError("boom"));
    await expect(StoreContent()).rejects.toThrow("boom");
  });
});
