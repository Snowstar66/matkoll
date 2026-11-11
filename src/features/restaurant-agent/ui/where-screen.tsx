"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CheckIcon, PinIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { roundCoordinates } from "../domain/location";
import type { RestaurantSettings } from "../domain/types";
import type { LocationQuery } from "./actions-port";
import { texts } from "./format";
import { useOption } from "@/lib/use-option";
import { DirectMap } from "./direct-map";
import { BackLink, GhostButton, Headline, StickyFooter, StopBody, TextLink } from "./parts";
import { Radar } from "./radar";
import { SettingsFields } from "./settings-fields";

// Step 1: when, how far, how many, what to weigh. The phone's place is asked ONCE when the screen shows (a line says
// what it is used for and shows the state; "Försök igen" asks again). A refused, timed out or unreadable place leaves
// the map button working: Google Maps then uses the phone's own position. The place is rounded (domain/location.ts,
// about 1 km) before it leaves this screen; the server looks up the place NAME at OpenStreetMap and only the name
// goes on. Nothing about it is stored. There is no text field for a place.

export type GeoState = "asking" | "got" | "failed" | "unavailable";

export type WhereScreenProps = {
  settings: RestaurantSettings;
  onSettings: (next: RestaurantSettings) => void;
  onBack: () => void;
  onFind: (location: LocationQuery) => void;
  /** "Framme? Fota menyn": on to the photo of the menu. Left out: no link. */
  onPhoto?: () => void;
  /** E.g. "Kostar cirka 0,6 kr"; left out when unknown. */
  costText?: string;
  /** An answer of "needs_location" from the server: said above the status line. */
  notice?: string | null;
  /** Browser geolocation; replaced in tests. */
  getPosition?: (onOk: (lat: number, lng: number) => void, onFail: () => void) => void;
};

/** The browser's one-shot position, coarse and not older than a minute. Called when the screen shows and from "Försök igen". */
export function browserPosition(onOk: (lat: number, lng: number) => void, onFail: () => void): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return onFail();
  navigator.geolocation.getCurrentPosition((position) => onOk(position.coords.latitude, position.coords.longitude), onFail, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
}

export function WhereScreen({ settings, onSettings, onBack, onFind, onPhoto, costText, notice = null, getPosition }: WhereScreenProps) {
  const [geo, setGeo] = useState<GeoState>(() => (!getPosition && typeof navigator !== "undefined" && !navigator.geolocation ? "unavailable" : "asking"));
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // The AI web search is a parked experiment behind its own Tillval (per device): without it only the map shows.
  const webSearch = useOption("restaurantAgentWeb");
  const asked = useRef(false);
  const alive = useRef(true);
  const location: LocationQuery | null = coords ? { kind: "coords", ...coords } : null;

  function askPlace() {
    setGeo("asking");
    (getPosition ?? browserPosition)(
      (lat, lng) => {
        if (!alive.current) return;
        const rounded = roundCoordinates(lat, lng);
        if (!rounded) return setGeo("failed");
        setCoords(rounded);
        setGeo("got");
      },
      () => {
        if (alive.current) setGeo("failed");
      },
    );
  }

  // Once when the screen shows (the ref keeps a development double-run from asking twice).
  useEffect(() => {
    alive.current = true;
    if (!asked.current && geo !== "unavailable") {
      asked.current = true;
      askPlace();
    }
    return () => void (alive.current = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = coords ? { ...coords, radiusM: settings.radiusM } : null;
  const photo = onPhoto ? (
    <TextLink onClick={onPhoto} data-testid="restaurant-photo-link">
      <CameraIcon size={20} className="mr-2 shrink-0" />
      {texts.photoNow}
    </TextLink>
  ) : null;

  // No place (refused, timed out, unreadable or no device support): a screen of its own. The map still opens.
  if (geo === "failed" || geo === "unavailable") {
    return (
      <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-4" data-testid="restaurant-where" data-geo={geo}>
        <BackLink onClick={onBack}>{texts.backToMenu}</BackLink>
        <div className="flex flex-col gap-4 pb-4" data-testid="restaurant-place-failed">
          <StopBody icon={<PinIcon size={34} />} title={texts.noPlaceTitle}>
            {texts.noPlaceBody}
            {geo === "failed" ? <span className="mt-2 block">{texts.noPlaceTurnOn}</span> : null}
          </StopBody>
          <DirectMap primary cuisines={settings.cuisines} place={null} view={null} />
          {geo === "failed" ? (
            <TextLink onClick={askPlace} data-testid="restaurant-place-retry">
              {texts.retry}
            </TextLink>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-4" data-testid="restaurant-where" data-geo={geo}>
      <BackLink onClick={onBack}>{texts.backToMenu}</BackLink>
      <Headline>{texts.whereTitle}</Headline>
      <section className="flex flex-col gap-2" aria-label="Din plats" data-testid="restaurant-place" data-geo={geo}>
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        {geo === "asking" ? (
          <p role="status" className="flex items-center gap-2 text-body text-ink-2" data-testid="restaurant-place-asking">
            <PinIcon size={20} className="shrink-0" />
            {texts.askingPlace}
          </p>
        ) : null}
        {geo === "got" ? (
          <div role="status" className="flex flex-col gap-0.5" data-testid="restaurant-place-got">
            <p className="flex items-center gap-2 text-body font-semibold text-mint-ink">
              <PinIcon size={20} className="shrink-0" />
              {texts.placeGot}
              <CheckIcon size={18} className="shrink-0" />
            </p>
            {webSearch ? <p className="text-meta text-ink-3">{texts.osmLine}</p> : null}
          </div>
        ) : null}
      </section>
      <SettingsFields value={settings} onChange={onSettings} part="map" radar={geo === "got" ? <Radar radiusM={settings.radiusM} /> : undefined} />
      {webSearch ? <SettingsFields value={settings} onChange={onSettings} part="agent" /> : null}
      <StickyFooter>
        <DirectMap primary cuisines={settings.cuisines} place={null} view={view} />
        {photo}
        {webSearch ? (
          <GhostButton data-testid="restaurant-find" disabled={!location} onClick={() => location && onFind(location)}>
            {texts.find}
          </GhostButton>
        ) : null}
        {webSearch && costText ? <p className="text-center text-meta text-ink-3">{costText}</p> : null}
      </StickyFooter>
    </div>
  );
}

