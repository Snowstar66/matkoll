import "server-only";
import { type Store, storeChainSchema } from "../domain/store";
import { SettingsDataError, type SettingsDb } from "./client";

/**
 * The signed-in user's active recipe sites, as stored (bare domain names,
 * AD-11). RLS limits the rows to the user's own. Throws SettingsDataError
 * when the query fails.
 */
export async function loadActiveRecipeDomains(db: SettingsDb): Promise<string[]> {
  const { data, error } = await db.from("recipe_site").select("domain").eq("is_active", true).order("domain");
  if (error) throw new SettingsDataError(`query_failed ${error.code}`);
  return data.map((row) => row.domain);
}

const storeColumns = "id, name, chain, external_store_id, address, url, is_selected";

type StoreRow = {
  id: string;
  name: string;
  chain: string;
  external_store_id: string | null;
  address: string | null;
  url: string | null;
  is_selected: boolean;
};

/**
 * A row of `store` as the domain's Store. A chain outside STORE_CHAINS
 * (store_chain_check prevents it, but a later list may shrink) reads as
 * "Annan" and is logged, so one row never hides the others.
 */
export function toStore(row: StoreRow): Store {
  const chain = storeChainSchema.safeParse(row.chain);
  if (!chain.success) console.error("settings_store_unknown_chain", { reason: "unknown_chain" });
  return {
    id: row.id,
    name: row.name,
    chain: chain.success ? chain.data : "Annan",
    externalStoreId: row.external_store_id,
    address: row.address,
    url: row.url,
    isSelected: row.is_selected,
  };
}

/**
 * Every store of the signed-in user, unsorted (RLS limits the rows to the
 * user's own). Throws SettingsDataError when the query fails.
 */
export async function loadStores(db: SettingsDb): Promise<Store[]> {
  const { data, error } = await db.from("store").select(storeColumns);
  if (error) throw new SettingsDataError(`query_failed ${error.code}`);
  return data.map(toStore);
}

/**
 * The signed-in user's selected store, or `null` when none is selected.
 * Throws SettingsDataError when the query fails.
 */
export async function loadSelectedStore(db: SettingsDb): Promise<Store | null> {
  const { data, error } = await db.from("store").select(storeColumns).eq("is_selected", true).maybeSingle();
  if (error) throw new SettingsDataError(`query_failed ${error.code}`);
  return data ? toStore(data) : null;
}
