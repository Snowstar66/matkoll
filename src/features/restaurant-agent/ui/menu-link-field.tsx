"use client";

import { useId, useState } from "react";
import { Notice } from "@/components/notice";
import type { MenuLinkResult } from "./actions-port";
import { texts } from "./format";
import { BigButton, GhostButton } from "./parts";

// "Har du en länk till menyn?": a pasted https address; the server fetches the page safely and hands its text to
// Menyrådgivaren, which suggests dishes as it would from a photo. Needs no search and no map. A menu that is a picture
// or a PDF cannot be read from a link, so the person is told so and sent to the photo.

const messages: Record<Exclude<MenuLinkResult["status"], "ok" | "error">, string> = {
  invalid: "Det där ser inte ut som en länk med https. Klistra in hela adressen, till exempel https://restaurangen.se/meny.",
  unreachable: "Sidan gick inte att hämta just nu. Kontrollera länken eller försök igen.",
  image_or_pdf: "Sidan är en bild eller PDF, ta ett foto i stället.",
  too_short: "Jag hittade ingen menytext på sidan. Är menyn en bild, ta ett foto i stället.",
};

export function MenuLinkField({ read, onMenu, onPhoto }: { read: (url: string) => Promise<MenuLinkResult>; onMenu: (menu: { host: string; menuText: string }) => void; onPhoto: () => void }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<MenuLinkResult["status"] | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function submit() {
    if (url.trim() === "" || busy) return;
    setBusy(true);
    setProblem(null);
    let result: MenuLinkResult;
    try {
      result = await read(url.trim());
    } catch {
      result = { status: "unreachable" };
    }
    setBusy(false);
    if (result.status === "ok") return onMenu({ host: result.host, menuText: result.menuText });
    setProblem(result.status);
    setErrorText(result.status === "error" ? result.message : null);
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-surface p-3" data-testid="menu-link">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {texts.menuLinkLabel}
      </label>
      <input
        id={id}
        data-testid="menu-link-input"
        type="url"
        inputMode="url"
        autoComplete="off"
        value={url}
        placeholder="https://restaurangen.se/meny"
        onChange={(event) => setUrl(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        className="min-h-tap w-full min-w-0 rounded-md border border-border bg-bg px-3 text-body text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
      <p className="text-meta text-ink-2">{texts.menuLinkHint}</p>
      {problem ? (
        <Notice role="alert">
          <span data-testid="menu-link-problem">{problem === "error" ? errorText : messages[problem as keyof typeof messages]}</span>
        </Notice>
      ) : null}
      {problem === "image_or_pdf" || problem === "too_short" ? <GhostButton onClick={onPhoto}>{texts.photoInstead}</GhostButton> : null}
      <BigButton data-testid="menu-link-read" disabled={url.trim() === "" || busy} onClick={() => void submit()}>
        {busy ? texts.menuLinkBusy : texts.menuLinkRead}
      </BigButton>
    </section>
  );
}
