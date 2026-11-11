import { pastedMenuUrl } from "../domain/own-site";
import { htmlToText } from "../domain/page-text";
import type { PageFetcher } from "../data/public-fetch";
import type { MenuLinkResult } from "./contract";

// "Har du en länk till menyn?": fetches the pasted page safely (data/public-fetch.ts) and gives back its text for
// Menyrådgivaren, which reads it as it would a photographed menu. No search, no model here; reading the menu costs the
// advisor's tokens only. Injected so it is tested with a fake fetch.

export const maxMenuLinkChars = 8_000;
/** A page with less text than this (a bare shell, or a menu that is a picture) is not a readable menu. */
const minChars = 40;

export async function runReadMenuLink(deps: { signedIn: () => Promise<boolean>; fetchPage: PageFetcher }, url: unknown): Promise<MenuLinkResult> {
  if (!(await deps.signedIn())) return { status: "error", message: "Du behöver logga in igen." };
  if (!pastedMenuUrl(url)) return { status: "invalid" };
  const page = await deps.fetchPage(url as string);
  if (!page.ok) return page.reason === "not_text" ? { status: "image_or_pdf" } : page.reason === "invalid" ? { status: "invalid" } : { status: "unreachable" };
  const menuText = htmlToText(page.html, maxMenuLinkChars);
  if (menuText.length < minChars) return { status: "too_short" };
  return { status: "ok", menuText, host: new URL(page.url).hostname.replace(/^www\./, "") };
}
