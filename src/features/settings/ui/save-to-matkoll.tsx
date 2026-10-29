"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { useToast } from "@/components/toast";
import { bookmarklet, importUrlPrefix } from "../domain/save-link";

const noSubscription = () => () => {};
const originNow = () => window.location.origin;
const originOnServer = () => null;

/**
 * "Spara i Matkoll" (Story 1.13): how to send a recipe from a recipe site to
 * Matkoll without copying the link. The address is built from the site's own
 * origin in the browser, so it is right on localhost and on the published site.
 */
export function SaveToMatkoll() {
  const headingId = useId();
  const origin = useSyncExternalStore<string | null>(noSubscription, originNow, originOnServer);
  const { showToast } = useToast();
  const anchor = useRef<HTMLAnchorElement>(null);

  // React does not render javascript: addresses, so the bookmarklet is set on the element itself.
  useEffect(() => {
    if (origin) anchor.current?.setAttribute("href", bookmarklet(origin));
  }, [origin]);

  // Story 1.14: the page streams in and the shell puts the scroll back at the top, so the browser's own jump to
  // #spara-i-matkoll is lost. Scroll there again a few times while the page settles.
  useEffect(() => {
    if (window.location.hash !== "#spara-i-matkoll") return;
    const timers = [0, 100, 300, 800].map((delay) =>
      window.setTimeout(() => document.getElementById("spara-i-matkoll")?.scrollIntoView(), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const prefix = origin ? importUrlPrefix(origin) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(prefix);
      showToast("Adressen är kopierad.");
    } catch {
      showToast("Det gick inte att kopiera. Markera adressen och kopiera den själv.");
    }
  }

  return (
    <section id="spara-i-matkoll" aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-3" data-testid="save-to-matkoll">
      <h2 id={headingId} className="text-section-label text-ink-2">
        Spara i Matkoll
      </h2>
      <p className="text-body text-ink-2">
        Öppna ett recept på en godkänd receptsajt och skicka det till Matkoll med ett tryck, utan att kopiera länken.
      </p>
      <p className="text-body text-ink-2" data-testid="bookmarklet-tip">
        Tips: dra knappen till bokmärkesfältet (visa det med ⌘⇧B i Chrome).
      </p>
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
        <h3 className="font-semibold">Dator</h3>
        <p className="text-body text-ink-2">
          Dra knappen till bokmärkesfältet. Tryck på den när du står på ett recept, så öppnas Matkoll i en ny flik.
        </p>
        <a
          ref={anchor}
          data-testid="bookmarklet"
          onClick={(event) => event.preventDefault()}
          draggable
          className="w-fit rounded-full bg-accent px-4 py-2 text-on-accent"
        >
          Spara i Matkoll
        </a>
      </div>
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
        <h3 className="font-semibold">iPhone</h3>
        <ol className="list-decimal pl-5 text-body text-ink-2">
          <li>Öppna appen Genvägar och skapa en ny genväg.</li>
          <li>Slå på &quot;Visa i Dela-menyn&quot; och låt den ta emot URL:er.</li>
          <li>Lägg till åtgärden &quot;Öppna URL:er&quot;.</li>
          <li>
            Skriv adressen nedan som URL och lägg direkt efter den till genvägens indata (variabeln Genvägsindata).
          </li>
          <li>Döp genvägen till &quot;Spara i Matkoll&quot;.</li>
          <li>På ett recept: tryck Dela och välj Spara i Matkoll.</li>
        </ol>
        <code className="break-all rounded-md bg-bg p-2 text-body" data-testid="import-prefix">
          {prefix}
        </code>
        <div>
          <Button variant="secondary" onClick={copy} disabled={!origin}>
            Kopiera adressen
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
        <h3 className="font-semibold">Android</h3>
        <p className="text-body text-ink-2">
          Installera Matkoll som app. Då finns Matkoll i Dela-menyn när du delar ett recept.
        </p>
      </div>
      <p className="text-body text-ink-2">
        Telefonen når Matkoll först när appen är publicerad, och receptsajten måste finnas bland de{" "}
        <Link href="#godkanda-receptsajter" className="text-accent underline">
          godkända receptsajterna
        </Link>{" "}
        ovan.
      </p>
    </section>
  );
}
