import "server-only";
import { createHash } from "node:crypto";

// The id of an own item that was added from something else (Story 9.12).

/** The own item's id for `key`: the same key always gives the same id (a version 4 shaped uuid made from a hash). */
export function keyedItemId(key: string): string {
  const hex = createHash("sha256").update(`keyed-custom-item:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
