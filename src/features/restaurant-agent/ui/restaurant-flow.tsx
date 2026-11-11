"use client";

import { useEffect, useRef, useState } from "react";
import { type RestaurantSettings } from "../domain/types";
import type { FindResult, LocationQuery, RestaurantAgentActions, SuggestionView } from "./actions-port";
import { texts } from "./format";
import { HandoverScreen } from "./handover-screen";
import { RestaurantSettingsSheet } from "./settings-sheet";
import { readStoredSettings, writeStoredSettings } from "./settings-store";
import { ResultsScreen } from "./results-screen";
import { RunningScreen } from "./running-screen";
import { StopScreen, type StopKind } from "./stop-screens";
import { WhereScreen, type WhereScreenProps } from "./where-screen";

// The whole journey of Restaurangagenten as one component the route layer drops in: where, running, results (or a
// stop), handover. It holds the choices (kept on this device) and the place of this run in memory only; closing
// the screen forgets the place. All it calls is `actions.findRestaurants`.

type Stage = "where" | "running" | "results" | "stop" | "handover";

export type RestaurantFlowProps = {
  actions: RestaurantAgentActions;
  /** Leaves the flow: back to Menyrådgivarens start, where the photo of the menu is. */
  onClose: () => void;
  /** Hands a found menu text to Menyrådgivaren. Left out: the screen shows the text and the photo way only. */
  onUseMenu?: (menu: { id: string; name: string; menuText: string }) => void;
  costText?: string;
  /** Test seam for the browser's position. */
  getPosition?: WhereScreenProps["getPosition"];
};

const placeWords = (location: LocationQuery | null, found: string | null = null) => found ?? (location?.kind === "text" ? location.text : "din plats");

export function RestaurantFlow({ actions, onClose, onUseMenu, costText, getPosition }: RestaurantFlowProps) {
  const [stage, setStage] = useState<Stage>("where");
  const [settings, setSettings] = useState<RestaurantSettings>(readStoredSettings);
  const [location, setLocation] = useState<LocationQuery | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionView[]>([]);
  // The city or district the search used (looked up on the server for a position), kept for the headline and the map link.
  const [foundPlace, setFoundPlace] = useState<string | null>(null);
  const [stop, setStop] = useState<{ kind: StopKind; message?: string } | null>(null);
  const [chosen, setChosen] = useState<SuggestionView | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A run that was stopped or replaced must not change the screen when its answer comes.
  const run = useRef(0);
  useEffect(() => () => void (run.current += 1), []);

  function changeSettings(next: RestaurantSettings) {
    setSettings(next);
    writeStoredSettings(next);
  }

  async function find(at: LocationQuery, using: RestaurantSettings = settings) {
    const mine = ++run.current;
    setLocation(at);
    setNotice(null);
    setSheetOpen(false);
    setStage("running");
    let result: FindResult;
    try {
      result = await actions.findRestaurants({ location: at, settings: using, cuisines: [...using.cuisines] });
    } catch {
      result = { status: "error", message: "Det gick inte att nå tjänsten. Kontrollera nätet och försök igen." };
    }
    if (mine !== run.current) return;
    if (result.status === "ok") {
      if (result.suggestions.length === 0) {
        setStop({ kind: "no_results" });
        return setStage("stop");
      }
      setSuggestions(result.suggestions);
      setFoundPlace(result.place);
      return setStage("results");
    }
    if (result.status === "needs_location") {
      setNotice(texts.placeFailed);
      return setStage("where");
    }
    setStop(result.status === "error" ? { kind: "error", message: result.message } : { kind: result.status });
    setStage("stop");
  }

  function cancel() {
    run.current += 1;
    setStage("where");
  }

  const where = placeWords(location, stage === "running" ? null : foundPlace);
  let screen;
  if (stage === "running") screen = <RunningScreen settings={settings} where={where} onCancel={cancel} />;
  else if (stage === "results") {
    screen = (
      <ResultsScreen
        suggestions={suggestions}
        settings={settings}
        where={where}
        place={foundPlace ?? ""}
        onChoose={(suggestion) => {
          setChosen(suggestion);
          setStage("handover");
        }}
        onSettings={() => setSheetOpen(true)}
        onBack={() => setStage("where")}
      />
    );
  } else if (stage === "handover" && chosen) {
    screen = <HandoverScreen suggestion={chosen} onUseMenu={onUseMenu} onPhoto={onClose} onBack={() => setStage("results")} />;
  } else if (stage === "stop" && stop) {
    screen = (
      <StopScreen
        kind={stop.kind}
        message={stop.message}
        cuisines={settings.cuisines}
        view={location?.kind === "coords" ? { lat: location.lat, lng: location.lng, radiusM: settings.radiusM } : null}
        onAdjust={() => setStage("where")}
        onRetry={() => (location ? void find(location) : setStage("where"))}
        onPhoto={onClose}
      />
    );
  } else {
    screen = (
      <WhereScreen
        settings={settings}
        onSettings={changeSettings}
        onBack={onClose}
        onFind={(at) => void find(at)}
        costText={costText}
        notice={notice}
        getPosition={getPosition}
      />
    );
  }
  return (
    <div data-testid="restaurant-flow" data-stage={stage}>
      {screen}
      <RestaurantSettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={settings}
        onChange={changeSettings}
        onSearchAgain={location ? () => void find(location) : undefined}
      />
    </div>
  );
}
