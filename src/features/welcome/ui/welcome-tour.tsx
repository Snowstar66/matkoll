"use client";

import { type ChangeEvent, type ReactNode, type Ref, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { appName } from "@/app/app-info";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { ChevronRightIcon } from "@/components/icons";
import {
  DuoBookmarkIcon,
  DuoBoxIcon,
  DuoCameraIcon,
  DuoCompassIcon,
  DuoFridgeIcon,
  DuoHouseIcon,
} from "@/components/icons-duo";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { markTourSeen } from "../actions/mark-tour-seen";
import { clampTourPage, isLastTourPage, pageAfterSwipe, tourPageCount, tourPageLabel, type TourExit } from "../domain/tour";
import { TourArt, type TourArtName } from "./tour-art";

// Välkomsttur (Story 20.1, hjalp-valkomst.html, "1. Välkomsttur"): six pages
// with a large line drawing, a light title and one sentence. Full screen on a
// phone (no tab bar); a 560 px dialog over the dimmed app on a desktop. Built on
// the native modal <dialog>, so focus stays inside and the app behind is inert.
//
// Fortsätt, a swipe, a dot or the arrow keys change the page; Hoppa över and Esc
// close it. On the last page Fortsätt and Hoppa över give way to three choices,
// each of which closes it. Every way of closing records on the server that the
// tour has been seen. The pages slide 460 ms; the drawing is drawn out (1.1 s)
// and the title and sentence rise 12 px. With "Minska rörelse" the page only
// fades in. The screen reader gets the dialog named by the page's title and
// "Sida N av 6" on every change.

type Page = {
  art: TourArtName | null;
  title: string;
  text: string;
  extra?: ReactNode;
};

const trio = [
  { icon: <DuoBookmarkIcon size={40} />, title: "Recept och matsedel", text: "Spara, planera, handla." },
  { icon: <DuoFridgeIcon size={40} />, title: "Matvaror", text: "Vet vad som finns hemma." },
  { icon: <DuoBoxIcon size={40} />, title: "Förråd", text: "Hitta sakerna igen." },
];

const pages: Page[] = [
  {
    art: "home",
    title: `Välkommen till ${appName}`,
    text: "Maten och sakerna hemma, på ett ställe.",
    extra: (
      <div className="mt-8 grid w-full grid-cols-3 gap-2.5">
        {trio.map((item) => (
          <div key={item.title} className="flex flex-col items-center gap-1">
            <span className="mb-1.5">{item.icon}</span>
            <b className="text-[15px] leading-5 font-semibold text-ink">{item.title}</b>
            <span className="text-[13px] leading-[18px] text-ink-2">{item.text}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    art: "recipe",
    title: "Spara recept var du än hittar dem",
    text: `Klistra in en länk, fota en kokbok eller skriv av. ${appName} läser in ingredienser och steg.`,
  },
  {
    art: "plan",
    title: "Planera veckan. Listan skriver sig själv.",
    text: "Lägg rätter på matsedeln, så räknas inköpslistan fram. Det du redan har dras av.",
  },
  {
    art: "fridge",
    title: "Vet vad som finns hemma",
    text: `Fota kylen, så föreslår ${appName} varorna. Kan lagas nu visar vad du kan laga direkt.`,
  },
  {
    art: "shelf",
    title: "Hitta sakerna igen",
    text: "Fota en hylla eller en låda. Sedan frågar du bara: var är passen?",
  },
  { art: null, title: "Var vill du börja?", text: "Rundturen finns kvar under Hjälp och tips." },
];

export type WelcomeTourProps = {
  /**
   * The tour has closed: `skip` for Hoppa över and Esc, otherwise the choice on the last page. For
   * `photo-fridge` the photo just taken (the camera opens from the tap itself, which a browser
   * allows only inside the tap); the caller hands it on to Matvaror. Seen is already recorded.
   */
  onExit: (exit: TourExit, photo?: File) => void;
};

export function WelcomeTour({ onExit }: WelcomeTourProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const swipeStartX = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  // The first page is shown, but only drawn out after the dialog has opened, so its drawing is seen.
  const [shown, setShown] = useState(false);
  const titleId = useId();
  const touch = useCoarsePointer();
  const last = isLastTourPage(index);

  const latestExit = useRef(onExit);
  useEffect(() => {
    latestExit.current = onExit;
  }, [onExit]);
  const closed = useRef(false);

  function exit(how: TourExit, photo?: File) {
    if (closed.current) return;
    closed.current = true;
    // Recorded in the background: the tour closes at once, and a failure (logged on the server)
    // only means it may show again at the next start.
    void markTourSeen().catch(() => {});
    latestExit.current(how, photo);
  }

  function go(n: number) {
    setIndex(clampTourPage(n));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Focus starts on the page's title (it names the dialog), so a tap never leaves a ring on Hoppa över.
    dialog.querySelector<HTMLElement>("h2[id]")?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => setShown(true));
    return () => {
      cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
    };
  }, []);

  // Hidden by the router (a page kept in the background, Activity): the next showing starts again on page 1.
  useLayoutEffect(
    () => () => {
      setIndex(0);
      setShown(false);
      closed.current = false;
    },
    [],
  );

  // Focus never stays on what the page change made inert (Fortsätt on the last page, a choice when
  // going back): it moves to the first choice on the last page, else to Fortsätt.
  useEffect(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !dialogRef.current?.contains(active) || !active.closest("[inert]")) return;
    (last ? firstChoiceRef : continueRef).current?.focus();
  }, [index, last]);

  function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) exit("photo-fridge", file);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="welcome-tour"
      onCancel={(event) => {
        // Esc: the same as Hoppa över.
        event.preventDefault();
        exit("skip");
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          go(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(index - 1);
        }
      }}
      className={cx(
        "m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-tour-bg p-0 text-ink",
        "desktop:m-auto desktop:h-[min(680px,calc(100dvh-48px))] desktop:w-[calc(100%-2*var(--gutter-mobile))] desktop:max-w-dialog desktop:rounded-xl desktop:shadow-float",
      )}
    >
      <div className="relative h-full overflow-hidden">
        <button
          type="button"
          onClick={() => exit("skip")}
          inert={last}
          className={cx(
            "absolute top-[calc(env(safe-area-inset-top)+6px)] right-2 z-10 flex h-tap items-center rounded-md px-3 text-control text-ink-2",
            "motion-safe:transition-opacity motion-safe:duration-200",
            last && "pointer-events-none opacity-0",
          )}
        >
          Hoppa över
        </button>

        <div
          className="flex h-full touch-pan-y motion-safe:transition-transform motion-safe:duration-[460ms] motion-safe:ease-[cubic-bezier(.22,.8,.24,1)]"
          style={{ transform: `translateX(${-index * 100}%)` }}
          onPointerDown={(event) => {
            swipeStartX.current = event.clientX;
          }}
          onPointerUp={(event) => {
            const start = swipeStartX.current;
            swipeStartX.current = null;
            if (start !== null) go(pageAfterSwipe(index, event.clientX - start));
          }}
          onPointerCancel={() => {
            swipeStartX.current = null;
          }}
        >
          {pages.map((page, i) => {
            const state = !shown ? "after" : i < index ? "before" : i > index ? "after" : "on";
            const on = i === index;
            return (
              <section
                key={page.title}
                aria-label={tourPageLabel(i)}
                aria-hidden={!on}
                inert={!on}
                data-state={state}
                className="group flex h-full w-full shrink-0 flex-col overflow-y-auto overscroll-contain px-7 pt-14 pb-[150px] text-center desktop:pb-[140px]"
              >
                <div data-state={state} className="m-auto flex w-full flex-col items-center">
                  {page.art ? (
                    <TourArt
                      name={page.art}
                      small={i === 0}
                      className={cx(
                        "motion-safe:transition-[transform,opacity] motion-safe:duration-[460ms] motion-safe:ease-[cubic-bezier(.22,.8,.24,1)]",
                        "motion-safe:group-data-[state=before]:-translate-x-[60px] motion-safe:group-data-[state=before]:scale-[.94] motion-safe:group-data-[state=before]:opacity-20",
                        "motion-safe:group-data-[state=after]:translate-x-[60px] motion-safe:group-data-[state=after]:scale-[.94] motion-safe:group-data-[state=after]:opacity-20",
                      )}
                    />
                  ) : (
                    <span className="flex size-[72px] items-center justify-center rounded-[20px] bg-illus-bg">
                      <DuoHouseIcon size={40} />
                    </span>
                  )}
                  <div
                    className={cx(
                      "tour-fade w-full",
                      "motion-safe:transition-[opacity,transform] motion-safe:delay-[80ms] motion-safe:duration-[420ms] motion-safe:ease-[cubic-bezier(.22,.8,.24,1)]",
                      "motion-safe:group-data-[state=before]:translate-y-3 motion-safe:group-data-[state=before]:opacity-0",
                      "motion-safe:group-data-[state=after]:translate-y-3 motion-safe:group-data-[state=after]:opacity-0",
                    )}
                  >
                    <h2
                      id={on ? titleId : undefined}
                      tabIndex={-1}
                      className="mt-7 text-tour-title text-balance text-ink outline-none"
                    >
                      {page.title}
                    </h2>
                    <p className="mx-auto mt-3 max-w-[310px] text-tour-text text-pretty text-ink-2">{page.text}</p>
                    {page.extra}
                    {isLastTourPage(i) ? (
                      <div className="mt-8 flex w-full flex-col gap-2.5 text-left">
                        <Choice
                          ref={firstChoiceRef}
                          icon={<DuoBookmarkIcon size={26} />}
                          title="Lägg till ett recept"
                          text="Från en länk, ett foto eller text"
                          onClick={() => exit("add-recipe")}
                        />
                        <Choice
                          icon={<DuoCameraIcon size={26} />}
                          title="Fotografera kylen"
                          text={`${appName} föreslår varorna`}
                          onClick={() => cameraRef.current?.click()}
                        />
                        <Choice
                          icon={<DuoCompassIcon size={26} />}
                          title="Titta runt själv"
                          text="Börja på Recept"
                          onClick={() => exit("explore")}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <div className="absolute inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+34px)] z-10">
          <div className="mb-1.5 flex h-tap items-center justify-center">
            {Array.from({ length: tourPageCount }, (_, k) => (
              <button
                key={k}
                type="button"
                aria-label={tourPageLabel(k)}
                aria-current={k === index ? "step" : undefined}
                onClick={() => go(k)}
                className="flex h-tap items-center px-1"
              >
                <span
                  className={cx(
                    "block h-[7px] rounded-full motion-safe:transition-[width,background-color] motion-safe:duration-300",
                    k === index ? "w-[22px] bg-accent" : "w-[7px] bg-border",
                  )}
                />
              </button>
            ))}
          </div>
          <Button
            ref={continueRef}
            fullWidth
            onClick={() => go(index + 1)}
            inert={last}
            className={cx("motion-safe:transition-opacity motion-safe:duration-200", last && "pointer-events-none opacity-0")}
          >
            Fortsätt
          </Button>
        </div>

        {/* "Sida 2 av 6" on every change of page. */}
        <p aria-live="polite" className="sr-only">
          {shown ? tourPageLabel(index) : ""}
        </p>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture={touch ? "environment" : undefined}
          tabIndex={-1}
          aria-hidden="true"
          data-testid="welcome-tour-camera"
          className="sr-only"
          onChange={onPhoto}
        />
      </div>
    </dialog>
  );
}

/** A card on the last page: a tile with a two-tone icon, a title and a line, and ›. */
function Choice({
  icon,
  title,
  text,
  onClick,
  ref,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="flex min-h-[72px] w-full items-center gap-3.5 rounded-lg border border-hairline bg-surface py-3 pr-3 pl-3.5 text-left dark:border-transparent"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-illus-bg">{icon}</span>
      <span className="min-w-0 flex-1">
        <b className="block text-row-title text-ink">{title}</b>
        <small className="block text-meta text-ink-3">{text}</small>
      </span>
      <ChevronRightIcon size={20} className="shrink-0 text-ink-3" />
    </button>
  );
}
