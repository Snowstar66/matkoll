"use server";

import { requireUser } from "@/features/auth/server";
import { fetchPublicPage } from "../data/public-fetch";
import type { MenuLinkResult } from "./contract";
import { runReadMenuLink } from "./menu-link";

/** The text of a pasted menu link (https only, safe fetch), for Menyrådgivaren. Never throws for an expected case. */
export async function readMenuLink(url: string): Promise<MenuLinkResult> {
  return runReadMenuLink({ signedIn: async () => (await requireUser()).ok, fetchPage: fetchPublicPage }, url);
}
