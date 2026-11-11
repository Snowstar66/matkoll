import { describe, expect, it, vi } from "vitest";
import type { PageResult } from "../data/public-fetch";
import { runReadMenuLink } from "./menu-link";

const menuHtml = "<html><body><h1>Meny</h1><ul><li>Pasta al pomodoro 135 kr</li><li>Pizza margherita 125 kr</li></ul></body></html>";
const deps = (page: PageResult, signedIn = true) => {
  const fetchPage = vi.fn(async (_url: string) => page);
  return { deps: { signedIn: async () => signedIn, fetchPage }, fetchPage };
};

describe("runReadMenuLink", () => {
  it("fetches a pasted https link and returns the page's text and host", async () => {
    const { deps: d, fetchPage } = deps({ ok: true, url: "https://www.trattoria.se/meny", html: menuHtml });
    expect(await runReadMenuLink(d, "https://www.trattoria.se/meny")).toEqual({ status: "ok", host: "trattoria.se", menuText: "Meny\nPasta al pomodoro 135 kr\nPizza margherita 125 kr" });
    expect(fetchPage).toHaveBeenCalledWith("https://www.trattoria.se/meny");
  });
  it("refuses http, credentials, ports, private and loopback hosts, other schemes and junk without fetching", async () => {
    for (const url of ["http://trattoria.se/meny", "https://user:pw@trattoria.se/", "https://trattoria.se:8443/", "https://localhost/meny", "https://127.0.0.1/", "https://10.0.0.5/", "https://169.254.169.254/latest/meta-data", "https://[::1]/", "file:///etc/passwd", "javascript:alert(1)", "nonsense", "", 5]) {
      const { deps: d, fetchPage } = deps({ ok: true, url: "https://x.se/", html: menuHtml });
      expect(await runReadMenuLink(d, url), String(url)).toEqual({ status: "invalid" });
      expect(fetchPage).not.toHaveBeenCalled();
    }
  });
  it("says a PDF or an image cannot be read, a blocked or failing page is unreachable, and a bare shell has no menu text", async () => {
    expect(await runReadMenuLink(deps({ ok: false, reason: "not_text" }).deps, "https://trattoria.se/meny.pdf")).toEqual({ status: "image_or_pdf" });
    expect(await runReadMenuLink(deps({ ok: false, reason: "blocked" }).deps, "https://trattoria.se/")).toEqual({ status: "unreachable" });
    expect(await runReadMenuLink(deps({ ok: false, reason: "unreachable" }).deps, "https://trattoria.se/")).toEqual({ status: "unreachable" });
    expect(await runReadMenuLink(deps({ ok: true, url: "https://trattoria.se/", html: "<html><body><script>app()</script></body></html>" }).deps, "https://trattoria.se/")).toEqual({ status: "too_short" });
  });
  it("requires sign-in and does not fetch without it", async () => {
    const { deps: d, fetchPage } = deps({ ok: true, url: "https://x.se/", html: menuHtml }, false);
    expect(await runReadMenuLink(d, "https://trattoria.se/")).toMatchObject({ status: "error" });
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
