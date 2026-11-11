import { SearchIcon, SparkleIcon, PinIcon } from "@/components/icons";
import { partyText, texts } from "./format";
import type { RestaurantSettings } from "../domain/types";
import { GhostButton, Headline, StickyFooter } from "./parts";

// Step 2: waiting. The search is one call, so the screen does not pretend to know how far it has come: it says what
// is being done and from which source, and that it can be stopped. Stopping ignores the answer when it arrives.

const steps = [
  { icon: PinIcon, text: "Söker på webben efter ställen", source: "Webbsökning via Claude" },
  { icon: SearchIcon, text: "Läser sidorna och letar efter menyer", source: "Bara sidor som sökningen hittade" },
  { icon: SparkleIcon, text: "Väljer ut de som passar er", source: "Efter hushållets smak och allergier" },
];

export function RunningScreen({ settings, where, onCancel }: { settings: RestaurantSettings; where: string; onCancel: () => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-4" data-testid="restaurant-running">
      <Headline sub={`${partyText(settings.party)}, ${where}`}>{texts.runningTitle}</Headline>
      <ul role="status" aria-live="polite" className="flex flex-col rounded-xl bg-surface px-4 py-1">
        {steps.map((step) => (
          <li key={step.text} className="flex items-start gap-3 border-b border-hairline py-3 last:border-b-0">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-sky text-sky-ink">
              <step.icon size={14} />
            </span>
            <span className="flex min-w-0 flex-col text-body text-ink">
              {step.text}
              <small className="text-meta text-ink-2">{step.source}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-meta text-ink-2">{texts.runningTakes}</p>
      <StickyFooter>
        <GhostButton data-testid="restaurant-cancel" onClick={onCancel}>
          {texts.cancel}
        </GhostButton>
      </StickyFooter>
    </div>
  );
}
