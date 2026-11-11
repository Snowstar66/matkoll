"use client";

import { useId, useState } from "react";
import { InfoIcon, PinIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { parsePlaceText, roundCoordinates } from "../domain/location";
import type { RestaurantSettings } from "../domain/types";
import type { LocationQuery } from "./actions-port";
import { texts } from "./format";
import { BackLink, BigButton, GhostButton, Headline, StickyFooter } from "./parts";
import { SettingsFields } from "./settings-fields";

// Step 1: where, how far, how many, what to weigh. The phone's own question about place is asked ONLY after the
// button is tapped (never on load), with a line above it saying what the place is used for. Refused, timed out or
// unreadable place falls back to the text field, which is always there. The place is rounded (domain/location.ts)
// before it leaves this screen, and nothing about it is stored.

export type GeoState = "idle" | "asking" | "got" | "failed" | "unavailable";

export type WhereScreenProps = {
  settings: RestaurantSettings;
  onSettings: (next: RestaurantSettings) => void;
  onBack: () => void;
  onFind: (location: LocationQuery) => void;
  /** E.g. "Kostar cirka 0,6 kr"; left out when unknown. */
  costText?: string;
  /** An answer of "needs_location" from the server or a place that was refused: the text field is open and says so. */
  notice?: string | null;
  /** Browser geolocation; replaced in tests. */
  getPosition?: (onOk: (lat: number, lng: number) => void, onFail: () => void) => void;
};

/** The browser's one-shot position, coarse and not older than a minute. Called only from a tap. */
export function browserPosition(onOk: (lat: number, lng: number) => void, onFail: () => void): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return onFail();
  navigator.geolocation.getCurrentPosition((position) => onOk(position.coords.latitude, position.coords.longitude), onFail, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
}

export function WhereScreen({ settings, onSettings, onBack, onFind, costText, notice = null, getPosition }: WhereScreenProps) {
  const [geo, setGeo] = useState<GeoState>(() => (!getPosition && typeof navigator !== "undefined" && !navigator.geolocation ? "unavailable" : "idle"));
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const textId = useId();
  const errorId = useId();
  const parsed = parsePlaceText(text);
  const typed = text.trim() !== "";
  const textError = typed && !parsed.ok ? (parsed.reason === "too_long" ? texts.textTooLong : texts.textInvalid) : null;
  // What a search would use: a typed place wins over a fetched one, so changing your mind is one keystroke.
  const location: LocationQuery | null = typed ? (parsed.ok ? { kind: "text", text: parsed.text } : null) : coords ? { kind: "coords", ...coords } : null;

  function askPlace() {
    setGeo("asking");
    (getPosition ?? browserPosition)(
      (lat, lng) => {
        const rounded = roundCoordinates(lat, lng);
        if (!rounded) return setGeo("failed");
        setCoords(rounded);
        setText("");
        setGeo("got");
      },
      () => setGeo("failed"),
    );
  }

  const geoNotice = notice ?? (geo === "failed" ? texts.placeFailed : geo === "unavailable" ? texts.placeUnavailable : null);

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-4" data-testid="restaurant-where">
      <BackLink onClick={onBack} />
      <Headline sub={texts.whereSub}>{texts.whereTitle}</Headline>
      <section className="flex flex-col gap-2" aria-label="Var">
        <h3 className="text-meta font-semibold tracking-wide text-ink-3 uppercase">Var</h3>
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
          {geoNotice ? <Notice role="alert">{geoNotice}</Notice> : null}
          {geo !== "unavailable" ? (
            <>
              {geo === "idle" ? (
                <p className="flex gap-2 text-meta text-ink-2">
                  <InfoIcon size={16} className="mt-0.5 shrink-0" />
                  {texts.placeHint}
                </p>
              ) : null}
              <GhostButton onClick={askPlace} disabled={geo === "asking"} data-testid="restaurant-use-place">
                <PinIcon size={20} />
                {geo === "asking" ? texts.askingPlace : texts.useMyPlace}
              </GhostButton>
            </>
          ) : null}
          {geo === "got" && !typed ? (
            <p role="status" className="text-meta text-mint-ink" data-testid="restaurant-place-got">
              {texts.placeGot}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={textId} className="text-body text-ink">
              {texts.textLabel}
            </label>
            <input
              id={textId}
              data-testid="restaurant-place-text"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={80}
              value={text}
              placeholder={texts.textPlaceholder}
              aria-invalid={touched && textError ? true : undefined}
              aria-describedby={touched && textError ? errorId : undefined}
              onChange={(event) => setText(event.currentTarget.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && location) onFind(location);
              }}
              className="min-h-tap w-full min-w-0 rounded-md border border-border bg-bg px-3 text-body text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            {touched && textError ? (
              <p id={errorId} role="alert" className="text-meta text-sky-ink">
                {textError}
              </p>
            ) : null}
          </div>
        </div>
      </section>
      <SettingsFields value={settings} onChange={onSettings} />
      <p className="text-meta text-ink-3">{texts.remembered}</p>
      <StickyFooter>
        <BigButton data-testid="restaurant-find" disabled={!location} onClick={() => location && onFind(location)}>
          {texts.find}
        </BigButton>
        {costText ? <p className="text-center text-meta text-ink-3">{costText}</p> : null}
      </StickyFooter>
    </div>
  );
}
