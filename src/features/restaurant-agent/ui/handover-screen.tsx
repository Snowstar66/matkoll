"use client";

import { CameraIcon, CheckIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import type { SuggestionView } from "./actions-port";
import { texts } from "./format";
import { BackLink, BigButton, GhostButton, Headline, StickyFooter, TextLink } from "./parts";

// Step 4: the place is chosen. With menu text quoted from a page the search found, the text goes on to Menyrådgivaren
// (the route layer decides how: `onUseMenu`), and nothing but the name and the menu text goes with it, never the
// place. Without a menu the way on is the photo of the menu, as Menyrådgivaren always had.

export function HandoverScreen({ suggestion, onUseMenu, onPhoto, onBack }: { suggestion: SuggestionView; onUseMenu?: (menu: { id: string; name: string; menuText: string }) => void; onPhoto: () => void; onBack: () => void }) {
  const text = suggestion.menuStatus === "found" ? suggestion.menuText : null;
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-1 flex-col gap-4" data-testid="restaurant-handover" data-menu={text ? "found" : "missing"}>
      <BackLink onClick={onBack}>{texts.backToSuggestions}</BackLink>
      <Headline>{suggestion.name}</Headline>
      {text ? (
        <>
          <div className="flex gap-2 rounded-xl bg-mint p-3 text-body text-mint-ink">
            <CheckIcon size={20} className="mt-0.5 shrink-0" />
            <span>
              <b className="font-semibold">{texts.handoverFound}</b> {texts.handoverFoundBody}
            </span>
          </div>
          <details className="rounded-xl bg-surface p-3" data-testid="restaurant-menu-text">
            <summary className="min-h-tap cursor-pointer text-body font-medium text-ink">{texts.handoverShowMenu}</summary>
            <p className="mt-2 text-meta whitespace-pre-line text-ink-2 wrap-break-word">{text}</p>
          </details>
          <StickyFooter>
            {onUseMenu ? (
              <BigButton data-testid="restaurant-use-menu" onClick={() => onUseMenu({ id: suggestion.id, name: suggestion.name, menuText: text })}>
                {texts.handoverUse}
              </BigButton>
            ) : null}
            <TextLink onClick={onPhoto} data-testid="restaurant-photo-instead">
              {texts.photoInstead}
            </TextLink>
          </StickyFooter>
        </>
      ) : (
        <>
          <Notice role="status">
            <b className="font-semibold">{texts.handoverMissing}</b> {texts.handoverMissingBody}
          </Notice>
          <StickyFooter>
            <BigButton data-testid="restaurant-photo" onClick={onPhoto}>
              <CameraIcon size={22} />
              Ta bild
            </BigButton>
            <GhostButton onClick={onBack}>{texts.backToSuggestions}</GhostButton>
          </StickyFooter>
        </>
      )}
    </div>
  );
}
