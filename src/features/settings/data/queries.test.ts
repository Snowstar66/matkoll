import { describe, expect, it, vi } from "vitest";
import { toStore } from "./queries";

// toStore without a database: store_chain_check keeps the chain in
// STORE_CHAINS, but a row outside it must never hide the other stores.

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Konsum Centrum",
  chain: "ICA",
  external_store_id: null,
  address: "Storgatan 1",
  url: null,
  offers_url: null,
  is_selected: false,
};

describe("toStore", () => {
  it("maps a row to the domain's Store", () => {
    expect(toStore(row)).toEqual({
      id: row.id,
      name: "Konsum Centrum",
      chain: "ICA",
      externalStoreId: null,
      address: "Storgatan 1",
      url: null,
      offersUrl: null,
      isSelected: false,
    });
  });

  it("reads an unknown chain as Annan and logs only the reason", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(toStore({ ...row, chain: "Konsum" }).chain).toBe("Annan");
    expect(log).toHaveBeenCalledWith("settings_store_unknown_chain", { reason: "unknown_chain" });
    log.mockRestore();
  });
});
