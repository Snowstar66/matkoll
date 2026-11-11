import Link from "next/link";
import { ClockIcon } from "./icons-local";
import { PinIcon, SearchIcon, InfoIcon } from "@/components/icons";
import { buttonClasses } from "@/components/button";
import { radiiM, type RadiusM } from "../domain/types";
import { radiusLabels, texts } from "./format";
import { BigButton, GhostButton, StopBody, TextLink } from "./parts";

// The stops: each has its own screen, one explanation in plain words and a way on. Never red, never a blank list.

export type StopKind = "needs_location" | "no_results" | "cap_reached" | "error";

const nextRadius = (radiusM: RadiusM): RadiusM | null => radiiM.find((radius) => radius > radiusM) ?? null;

export function StopScreen({
  kind,
  message,
  radiusM,
  onAdjust,
  onRetry,
  onWiden,
  onPhoto,
}: {
  kind: StopKind;
  /** What the server said for an error; shown when it is a sentence for people. */
  message?: string;
  radiusM: RadiusM;
  onAdjust: () => void;
  onRetry: () => void;
  onWiden: (radiusM: RadiusM) => void;
  onPhoto: () => void;
}) {
  const wider = nextRadius(radiusM);
  return (
    <div className="flex flex-col gap-4 pb-4" data-testid="restaurant-stop" data-kind={kind}>
      {kind === "needs_location" ? (
        <>
          <StopBody icon={<PinIcon size={34} />} title={texts.needsLocationTitle}>
            {texts.needsLocationBody}
          </StopBody>
          <BigButton onClick={onAdjust}>Välj plats</BigButton>
        </>
      ) : null}
      {kind === "no_results" ? (
        <>
          <StopBody icon={<SearchIcon size={34} />} title={texts.noResultsTitle}>
            {texts.noResultsBody}
          </StopBody>
          {wider ? <BigButton onClick={() => onWiden(wider)}>{`Sök inom ${radiusLabels[wider]}`}</BigButton> : null}
          <GhostButton onClick={onAdjust}>{texts.adjust}</GhostButton>
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
    </div>
  );
}
