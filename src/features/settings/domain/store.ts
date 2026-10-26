import { z } from "zod";
import { charLength as length, normalizeHttpsUrl, oneLine } from "@/lib/one-line";

// Pontus's stores (FR-28, Story 7.1): several stores, in several chains and
// several in one chain, are the normal case (docs/beslutslogg.md,
// 2026-10-26); `isSelected` marks the one the basket export and the product
// choices use now. One schema for the sheet and saveStore (AD-12). Pure, so
// it is tested without a database. The table's checks
// (supabase/migrations/*_settings_store.sql) follow the same rules.

/**
 * The chains a store can belong to: a fixed list, so a later price
 * comparison can read prices per chain without reading free text. "Annan"
 * covers the rest, and the store's name says which. store_chain_check lists
 * the same values in the same order (tests/design/settings-checks).
 */
export const STORE_CHAINS = ["ICA", "Willys", "Coop", "Lidl", "Hemköp", "City Gross", "Annan"] as const;
export type StoreChain = (typeof STORE_CHAINS)[number];
export const storeChainSchema = z.enum(STORE_CHAINS);

/** A store as Inställningar, the product choices (7.2) and the export (7.3) read it. */
export type Store = {
  id: string;
  name: string;
  chain: StoreChain;
  /** The store's id at its chain, e.g. ICA Handla's "1003733"; `null` when not given. */
  externalStoreId: string | null;
  address: string | null;
  /** Text Pontus typed, https only; shown as a link and never fetched. */
  url: string | null;
  isSelected: boolean;
};

/** Longest values, in characters (code points), as the table's checks count them (char_length). */
export const maxStoreNameLength = 100;
export const maxExternalStoreIdLength = 40;
export const maxStoreAddressLength = 200;
export const maxStoreUrlLength = 2048;

export const storeNameRequiredMessage = "Ange butikens namn.";
export const storeUrlMessage = "Ange en adress som börjar med https://.";
export function tooLongMessage(max: number): string {
  return `Texten får vara högst ${max} tecken.`;
}

/** The card's line when the store has no address. */
export const noAddressText = "Ingen adress angiven";
/** The short confirmation after "Spara" in the sheet. */
export const storeSavedText = "Butiken är sparad.";
/** In the section when no store is selected (not possible in v1, but getSelectedStore may give null). */
export const noSelectedStoreText = "Ingen butik är vald.";
/** The help text under Kedja when a store is changed: its product choices stay with the row. */
export const changeChainHint = "Byter du kedja, lägg hellre till en ny butik, så behåller den här sina produktval.";

/** "Maxi ICA Stormarknad Östersund är vald.", the short confirmation after "Välj". */
export function selectedStoreText(name: string): string {
  return `${name} är vald.`;
}

/** "ICA · butiks-id 1003733", or just "Willys" without a store id. */
export function storeSummaryText(store: Pick<Store, "chain" | "externalStoreId">): string {
  return store.externalStoreId ? `${store.chain} · butiks-id ${store.externalStoreId}` : store.chain;
}

/** The order in Inställningar: the selected store first, then by name as Swedish sorts it. */
export function compareStores(a: Store, b: Store): number {
  if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
  return a.name.localeCompare(b.name, "sv") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * A one-line text as typed (src/lib/one-line.ts): stored names, ids and
 * addresses never break the export's line format (7.3), and the table's
 * checks refuse what is left out (supabase/migrations/*_settings_store_hardening.sql).
 */
export { oneLine };

/**
 * A new id for a store, chosen in the client (AD-20): crypto.randomUUID, or a
 * version 4 UUID from crypto.getRandomValues where randomUUID is missing
 * (it needs a secure context).
 */
export function newStoreId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The URL as stored: trimmed, with "https://" in lower case. `null` when it
 * is not an https address with a host, or has whitespace in it.
 */
export function normalizeStoreUrl(text: string): string | null {
  return normalizeHttpsUrl(text);
}

/**
 * `add` from Ny butik: adds the store, or changes the user's store with the
 * same id (a retry). `change` from Ändra butik: only changes, and a store
 * that is gone is `settings_store_gone`.
 */
export const STORE_SAVE_MODES = ["add", "change"] as const;
export type StoreSaveMode = (typeof STORE_SAVE_MODES)[number];

/** What the sheet sends and saveStore reads: the fields as typed. */
export type StoreFormInput = {
  id: string;
  mode: string;
  name: string;
  chain: string;
  externalStoreId: string;
  address: string;
  url: string;
  /** "Använd för varukorgen": select the store when it is saved. */
  makeSelected: boolean;
};

/** The form's fields from FormData: the same reading in the sheet and in saveStore. */
export function readStoreForm(formData: FormData): StoreFormInput {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    id: text("id"),
    mode: text("mode"),
    name: text("name"),
    chain: text("chain"),
    externalStoreId: text("externalStoreId"),
    address: text("address"),
    url: text("url"),
    makeSelected: text("makeSelected") === "true",
  };
}

/**
 * A store as Pontus fills it in: `id` is chosen by the client, so a retry
 * after a lost answer saves the store once (AD-20). Name, store id and
 * address are trimmed to one line, and empty optional fields become `null`.
 * The URL must start with https:// and have a host.
 */
export const storeFormSchema = z
  .object({
    id: z.guid(),
    mode: z.enum(STORE_SAVE_MODES),
    name: z.string(),
    chain: storeChainSchema,
    externalStoreId: z.string(),
    address: z.string(),
    url: z.string(),
    makeSelected: z.boolean(),
  })
  .transform((form, context) => {
    let valid = true;
    const issue = (field: "name" | "externalStoreId" | "address" | "url", message: string) => {
      valid = false;
      context.addIssue({ code: "custom", path: [field], message });
    };
    const name = oneLine(form.name);
    if (!name) issue("name", storeNameRequiredMessage);
    else if (length(name) > maxStoreNameLength) issue("name", tooLongMessage(maxStoreNameLength));
    const externalStoreId = oneLine(form.externalStoreId);
    if (length(externalStoreId) > maxExternalStoreIdLength) {
      issue("externalStoreId", tooLongMessage(maxExternalStoreIdLength));
    }
    const address = oneLine(form.address);
    if (length(address) > maxStoreAddressLength) issue("address", tooLongMessage(maxStoreAddressLength));
    const typedUrl = form.url.trim();
    const url = typedUrl ? normalizeStoreUrl(typedUrl) : null;
    if (typedUrl && url === null) issue("url", storeUrlMessage);
    else if (url !== null && length(url) > maxStoreUrlLength) issue("url", tooLongMessage(maxStoreUrlLength));
    if (!valid) return z.NEVER;
    return {
      id: form.id,
      mode: form.mode,
      name,
      chain: form.chain,
      externalStoreId: externalStoreId || null,
      address: address || null,
      url,
      makeSelected: form.makeSelected,
    };
  });
export type StoreForm = z.output<typeof storeFormSchema>;

/**
 * The form's own messages by field name (`name`, `externalStoreId`,
 * `address`, `url`), the first per field, for `fail("validation", fields)`
 * and the sheet. Zod's built-in messages are English and never shown, so
 * only custom issues count: a chain or id that is not one gives none.
 */
export function storeFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (issue.code === "custom" && field && !(field in fields)) fields[field] = issue.message;
  }
  return fields;
}
