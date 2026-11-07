"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { FilterPills } from "@/components/filter-pills";
import { useToast } from "@/components/toast";
import { type Device } from "@/lib/device";
import { useDevice } from "@/lib/use-device";
import { type ApiKeyView } from "../domain/api-key";
import { saveRecipeShortcutUrl } from "../domain/phone-shortcuts";
import { bookmarklet, importUrlPrefix } from "../domain/save-link";
import { ApiKeys } from "./api-keys";
import { AddShortcutButton, BuildItYourself, cardClass } from "./shortcut-parts";
import { appName } from "@/app/app-info";

const noSubscription = () => () => {};
const originNow = () => window.location.origin;
const originOnServer = () => null;

const guideOptions = [
  { value: "iphone", label: "iPhone" },
  { value: "android", label: "Android" },
  { value: "computer", label: "Dator" },
] as const;

/** "Använd med telefonen": save recipes from Safari, and add items with Siri. */
export function PhoneSetup({ keys }: { keys: readonly ApiKeyView[] }) {
  return (
    <div className="flex flex-col gap-4" data-testid="phone-setup">
      <p className="px-1 desktop:px-0 text-meta text-ink-3">
        Två genvägar gör {appName} snabbare på telefonen.
      </p>
      <SaveRecipeCard />
      <ApiKeys keys={keys} />
    </div>
  );
}

/** "Spara recept från Safari": one guide at a time, starting on the viewer's own device. */
function SaveRecipeCard() {
  const { device } = useDevice();
  const origin = useSyncExternalStore<string | null>(noSubscription, originNow, originOnServer);
  const [chosen, setChosen] = useState<Device | null>(null);
  const guide: Device = chosen ?? device ?? "iphone";
  const { showToast } = useToast();
  const anchor = useRef<HTMLAnchorElement>(null);
  const prefix = origin ? importUrlPrefix(origin) : "";

  // React does not render javascript: addresses, so the bookmarklet is set on the element itself.
  useEffect(() => {
    if (origin && guide === "computer") anchor.current?.setAttribute("href", bookmarklet(origin));
  }, [origin, guide]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prefix);
      showToast("Adressen är kopierad.");
    } catch {
      showToast("Det gick inte att kopiera. Markera adressen och kopiera den själv.");
    }
  }

  return (
    <section aria-labelledby="save-recipe-heading" className={cardClass} data-testid="save-to-matkoll">
      <h2 id="save-recipe-heading" className="text-row-title text-ink">
        Spara recept från Safari
      </h2>
      <p className="text-body text-ink-2">Skicka ett recept till {appName} med ett tryck, utan att kopiera länken.</p>
      <FilterPills label="Enhet" options={guideOptions} value={guide} onChange={setChosen} />
      {guide === "iphone" ? (
        <div className="flex flex-col gap-3" data-testid="guide-iphone">
          {saveRecipeShortcutUrl ? (
            <>
              <AddShortcutButton url={saveRecipeShortcutUrl} />
              <ol className="list-decimal pl-5 text-body text-ink-2">
                <li>Tryck Lägg till genvägen.</li>
                <li>Öppna ett recept i Safari, tryck Dela och sedan Spara i {appName}.</li>
              </ol>
            </>
          ) : (
            <BuildItYourself testId="build-save-shortcut">
              <ol className="list-decimal pl-5 text-body text-ink-2">
                <li>Öppna appen Genvägar och tryck + för en ny genväg.</li>
                <li>
                  Döp den till ”Spara i {appName}”. Slå på Visa i Dela-menyn och låt den ta emot URL:er.
                </li>
                <li>Lägg till åtgärden Koda URL och låt den koda Genvägsindata.</li>
                <li>Lägg till åtgärden Text. Skriv adressen nedan och sätt den kodade URL:en direkt efter den.</li>
                <li>Lägg till åtgärden Öppna URL:er och låt den öppna texten.</li>
                <li>Öppna ett recept i Safari, tryck Dela och sedan Spara i {appName}.</li>
              </ol>
              <code className="break-all rounded-md bg-surface p-2 text-body" data-testid="import-prefix">
                {prefix}
              </code>
              <div>
                <Button variant="secondary" onClick={copy} disabled={!origin}>
                  Kopiera adressen
                </Button>
              </div>
            </BuildItYourself>
          )}
        </div>
      ) : null}
      {guide === "android" ? (
        <div className="flex flex-col gap-3" data-testid="guide-android">
          <p className="text-body text-ink-2">Installera appen. Sedan finns {appName} i Dela-menyn när du delar ett recept.</p>
        </div>
      ) : null}
      {guide === "computer" ? (
        <div className="flex flex-col gap-3" data-testid="guide-computer">
          <p className="text-body text-ink-2">
            Dra knappen till bokmärkesfältet (visa det med ⌘⇧B i Chrome). Tryck på den när du står på ett recept, så öppnas {appName} i en
            ny flik.
          </p>
          <a
            ref={anchor}
            data-testid="bookmarklet"
            onClick={(event) => event.preventDefault()}
            draggable
            className="w-fit rounded-full bg-accent px-4 py-2 text-on-accent"
          >
            Spara i {appName}
          </a>
        </div>
      ) : null}
    </section>
  );
}
