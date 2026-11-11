import Link from "next/link";
import { ClockIcon } from "./icons-local";
import { PinIcon, SearchIcon, InfoIcon } from "@/components/icons";
import { buttonClasses } from "@/components/button";
import type { CuisineId } from "../domain/types";
import { DirectMap } from "./direct-map";
import { texts } from "./format";
import { BigButton, StopBody, TextLink } from "./parts";

// The stops: each has its own screen, one explanation in plain words and a way on. Never red, never a blank list.

export type StopKind = "needs_location" | "no_results" | "cap_reached" | "error";

export function StopScreen({
  kind,
  message,
  cuisines,
  place,
  onAdjust,
  onRetry,
  onPhoto,
}: {
  kind: StopKind;
  /** What the server said for an error; shown when it is a sentence for people. */
  message?: string;
  /** The niches and the typed place of this run, for the map search that works when the agent cannot. */
  cuisines: readonly CuisineId[];
  place: string | null;
  onAdjust: () => void;
  onRetry: () => void;
  onPhoto: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 pb-4" data-testid="restaurant-stop" data-kind={kind}>
      {kind === "needs_location" ? (
        <>
          <StopBody icon={<PinIcon size={34} />} title={texts.needsLocationTitle}>
            {texts.needsLocationBody}
          </StopBody>
          <BigButton onClick={onAdjust}>Skriv en plats</BigButton>
        </>
      ) : null}
      {kind === "no_results" ? (
        <>
          <StopBody icon={<SearchIcon size={34} />} title={texts.noResultsTitle}>
            {texts.noResultsBody}
          </StopBody>
          <BigButton onClick={onAdjust}>{texts.adjust}</BigButton>
          <TextLink onClick={onPhoto}>{texts.photoInstead}</TextLink>
        </>
      ) : null}
      {kind === "cap_reached" ? (
        <>
          <StopBody icon={<ClockIcon />} title={texts.capTitle}>
            {texts.capBody}
          </StopBody>
          <Link href="/installningar/ai-kostnad" className={buttonClasses("secondary", true)}>
            {texts.capRaise}
          </Link>
          <TextLink onClick={onPhoto}>{texts.photoInstead}</TextLink>
        </>
      ) : null}
      {kind === "error" ? (
        <>
          <StopBody icon={<InfoIcon size={34} />} title={texts.errorTitle}>
            {message && message.trim() !== "" ? message : texts.errorBody}
          </StopBody>
          <BigButton onClick={onRetry}>{texts.retry}</BigButton>
          <TextLink onClick={onAdjust}>{texts.adjust}</TextLink>
        </>
      ) : null}
      {kind !== "needs_location" ? <DirectMap cuisines={cuisines} place={place} /> : null}
    </div>
  );
}
