import "server-only";
import type { Store, StoreForm } from "../domain/store";
import { SettingsDataError, type SettingsDb } from "./client";
import { toStore } from "./queries";

// Writes to `store` for Inställningar (FR-28, AD-1), through the Postgres
// functions save_store and select_store, which take a per-user lock so that
// changes at once run one after the other and exactly one store is selected
// after (supabase/migrations/*_settings_store*.sql). A store is never deleted
// in v1.

/** The table's unique key on chain and store id; Postgres names it in its error message. */
const duplicateStoreConstraint = "store_user_id_chain_external_store_id_key";
/** The primary key: an id another user has taken. */
const primaryKey = "store_pkey";

/**
 * What saving a store did: `saved` it, or found the same chain and store id
 * on another store (`duplicate`), no store to change (`gone`), or the id
 * taken by another user (`id_taken`; the caller tries again with a new id).
 */
export type SaveStoreOutcome =
  | { kind: "saved"; store: Store }
  | { kind: "duplicate" }
  | { kind: "gone" }
  | { kind: "id_taken" };

/**
 * Saves the signed-in user's store `form.id` with `form.mode`: `add` adds it
 * (or changes the user's store with that id, on a retry), `change` only
 * changes it. With `form.makeSelected`, or when the user has no selected
 * store, it becomes the selected one. Throws SettingsDataError when Supabase
 * fails otherwise.
 */
export async function saveStoreIn(db: SettingsDb, form: StoreForm): Promise<SaveStoreOutcome> {
  const { data, error } = await db.rpc("save_store", {
    store: {
      id: form.id,
      name: form.name,
      chain: form.chain,
      external_store_id: form.externalStoreId,
      address: form.address,
      url: form.url,
    },
    mode: form.mode,
    make_selected: form.makeSelected,
  });
  if (error) {
    if (error.code === "23505" && error.message.includes(duplicateStoreConstraint)) return { kind: "duplicate" };
    if (error.code === "23505" && error.message.includes(primaryKey)) return { kind: "id_taken" };
    if (error.code === "P0002") return { kind: "gone" };
    throw new SettingsDataError(`save_store ${error.code}`);
  }
  return { kind: "saved", store: toStore(data) };
}

/** What selecting a store did: `selected` it, or found that the user has no store with the id (`gone`). */
export type SelectStoreOutcome = "selected" | "gone";

/**
 * Makes the signed-in user's store `id` the selected one and deselects the
 * others. Another user's store is `gone` (P0002) and nothing changes. Throws
 * SettingsDataError when Supabase fails otherwise.
 */
export async function selectStoreIn(db: SettingsDb, id: string): Promise<SelectStoreOutcome> {
  const { error } = await db.rpc("select_store", { store_id: id });
  if (!error) return "selected";
  if (error.code === "P0002") return "gone";
  throw new SettingsDataError(`select_store ${error.code}`);
}
