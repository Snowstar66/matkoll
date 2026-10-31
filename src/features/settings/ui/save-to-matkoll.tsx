"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/button";
import { FilterPills } from "@/components/filter-pills";
import { useToast } from "@/components/toast";
import { bookmarklet, importUrlPrefix } from "../domain/save-link";

const noSubscription = () => () => {};
const originNow = () => window.location.origin;
const originOnServer = () => null;

type Guide = "computer" | "iphone" | "android";

const guideOptions = [
  { value: "computer", label: "Dator" },
  { value: "iphone", label: "iPhone" },
  { value: "android", label: "Android" },
] as const;

/** The guide for the device the page is opened on, so the right one shows first. */
function guideForDevice(): Guide {
  const { userAgent, maxTouchPoints } = navigator;
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(userAgent)) return "android";
  return "computer";
}

const guideOnServer = (): Guide | null => null;

/**
 * "Spara i Matkoll" (Story 1.13, Story 14.7): how to send a recipe from a recipe site to
 * Matkoll without copying the link. One guide at a time, chosen with the
 * segmented control Dator / iPhone / Android; it starts on the device's own.
 * The address is built from the site's own origin in the browser, so it is
 * right on localhost and on the published site.
 */
export function SaveToMatkoll() {
  const origin = useSyncExternalStore<string | null>(noSubscription, originNow, originOnServer);
  const deviceGuide = useSyncExternalStore<Guide | null>(noSubscription, guideForDevice, guideOnServer);
  const [chosen, setChosen] = useState<Guide | null>(null);
  const guide = chosen ?? deviceGuide ?? "computer";
  const { showToast } = useToast();
  const anchor = useRef<HTMLAnchorElement>(null);

  // React does not render javascript: addresses, so the bookmarklet is set on the element itself.
  useEffect(() => {
    if (origin && guide === "computer") anchor.current?.setAttribute("href", bookmarklet(origin));
  }, [origin, guide]);

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
    <section aria-label="Spara i Matkoll" className="flex flex-col gap-4" data-testid="save-to-matkoll">
      <p className="px-1 desktop:px-0 text-meta text-ink-3">
        Öppna ett recept på en godkänd receptsajt och skicka det till Matkoll med ett tryck, utan att kopiera länken.
      </p>
      <FilterPills
        segmented
        label="Enhet"
        options={guideOptions}
        value={guide}
        onChange={setChosen}
        className="h-9 w-full [&>button]:flex-1"
      />
      {guide === "computer" ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="guide-computer">
          <p className="text-body text-ink-2">
            Dra knappen till bokmärkesfältet (visa det med ⌘⇧B i Chrome). Tryck på den när du står på ett recept, så öppnas
            Matkoll i en ny flik.
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
      ) : null}
      {guide === "iphone" ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="guide-iphone">
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
      ) : null}
      {guide === "android" ? (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="guide-android">
          <p className="text-body text-ink-2">
            Installera Matkoll som app. Då finns Matkoll i Dela-menyn när du delar ett recept.
          </p>
        </div>
      ) : null}
      <p className="px-1 desktop:px-0 text-meta text-ink-3">
        Telefonen når Matkoll först när appen är publicerad, och receptsajten måste finnas bland de{" "}
        <Link href="/installningar/receptsajter" className="text-accent underline">
          godkända receptsajterna
        </Link>
        .
      </p>
    </section>
  );
}
