"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type MouseEvent, Suspense, useEffect, useRef, useState } from "react";
import { appName } from "@/app/app-info";
import { PageHeader } from "@/components/app-shell/page-header";
import { Chip, ChipRow } from "@/components/chip";
import { cx } from "@/components/cx";
import { ChevronRightIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { SearchField } from "@/components/search-field";
import { mainDestinations } from "@/components/app-shell/destinations";
import { type FeedbackAreaId, type FeedbackSheetKind, isFeedbackArea, isFeedbackSheetKind } from "@/features/feedback";
import { FeedbackSheet } from "@/features/feedback/ui/feedback-sheet";
import { type HelpArea, areaFromHash, helpAreas, helpUpdated, highlightParts, searchHelp } from "./help-content";
import { HelpIcon, type HelpIconName, PlayIcon, PlusMinusIcon } from "./help-icons";

/** Where the back link goes: the tab the page was opened from (`#matsedel`), else Recept. */
export function parentOf(hash: string): { href: string; label: string } {
  const tab = mainDestinations.find((destination) => destination.helpId === hash.replace(/^#/, ""));
  return { href: tab?.href ?? "/recept", label: tab?.label ?? "Recept" };
}

/** Where the tour is played again from Hjälp (Story 20.1): closing it comes back here. */
export const tourHref = "/valkomst?fran=hjalp";

/**
 * The Tyck till rows (Story 20.2). Each leads to this page with `?tyck=…`, which opens its
 * sheet (Story 20.3); closing the sheet takes the parameter away again.
 */
export const feedbackRows = [
  { kind: "idea", title: "Föreslå en funktion", icon: "bulb", tile: "bg-sand text-sand-ink" },
  { kind: "rate", title: `Betygsätt ${appName}`, icon: "star", tile: "bg-mint text-mint-ink" },
  { kind: "problem", title: "Något som inte funkar?", icon: "bubble", tile: "bg-tile-lilac text-ink-2" },
] as const satisfies readonly { kind: string; title: string; icon: HelpIconName; tile: string }[];

/** The address a Tyck till row leads to; `query` is the search word for Föreslå en funktion. */
export function feedbackHref(kind: (typeof feedbackRows)[number]["kind"], query?: string): string {
  return query ? `/hjalp?tyck=${kind}&q=${encodeURIComponent(query)}` : `/hjalp?tyck=${kind}`;
}

/** The page a message says it was sent from: the tab Hjälp was opened from (`#matvaror` → /hemma), else Hjälp itself. */
export function sentFromPage(hash: string): string {
  const tab = mainDestinations.find((destination) => destination.helpId === hash.replace(/^#/, ""));
  return tab?.href ?? "/hjalp";
}

/**
 * A tap on a Tyck till link opens its sheet without leaving the page: the address gets
 * `?tyck=…` (and the help area's `#…` stays), which FeedbackFromAddress reads. A click
 * with a modifier key (a new tab) is left to the browser.
 */
function openFeedback(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.replaceState(null, "", `${event.currentTarget.getAttribute("href")}${window.location.hash}`);
}

const months = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

const sectionLabel = "mx-1 mt-6 mb-2 text-section-label text-ink-2";
/** The line under a step and an answer: 15 px in ink-2 (hjalp-valkomst.html). */
const smallText = "text-[15px] leading-[21px] text-ink-2";
const rowFocus = "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/**
 * Hjälp och tips (Story 20.2): Sök i hjälpen, the card that plays the tour again, chips for
 * the six areas that show one area at a time, its three steps and its questions, and Tyck
 * till. Opened from a tab (`#matvaror`) the tab's area is chosen. While there is a search,
 * the hits in every area take the place of all that.
 */
export function HelpView({ version, ownerName }: { version: string; ownerName: string | null }) {
  const [areaId, setAreaId] = useState(helpAreas[0]!.id);
  const [parent, setParent] = useState(() => parentOf(""));
  const [query, setQuery] = useState("");
  // A new field each time the page is shown, so a search from before does not hide the area.
  const [visit, setVisit] = useState(0);
  const chipRow = useRef<HTMLDivElement>(null);

  // Each time the page is shown (also when it is shown again hidden by Activity): the area the address names.
  useEffect(() => {
    const hash = window.location.hash;
    /* eslint-disable react-hooks/set-state-in-effect -- the address is read only in the browser, after hydration. */
    setParent(parentOf(hash));
    setAreaId(areaFromHash(hash));
    setQuery("");
    setVisit((count) => count + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // The chosen chip is brought into the row when it is off to the side (Förråd at 390 px): only the row scrolls.
  useEffect(() => {
    const row = chipRow.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    // The row fades out over its last 12 % on a phone (ChipRow), so the chip stops before that.
    const end = rowBox.right - rowBox.width * 0.12;
    if (chipBox.right > end) row.scrollLeft += chipBox.right - end;
    else if (chipBox.left < rowBox.left) row.scrollLeft -= rowBox.left - chipBox.left;
  }, [areaId, query]);

  function choose(id: string) {
    setAreaId(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  const area = helpAreas.find((candidate) => candidate.id === areaId) ?? helpAreas[0]!;
  const search = query.trim();
  const { day, month } = helpUpdated;

  return (
    <div className="pb-4">
      <PageHeader title="Hjälp och tips" backHref={parent.href} backLabel={parent.label} collapsing />
      <SearchField key={visit} label="Sök i hjälpen" placeholder="Sök i hjälpen" delayMs={0} maxLength={100} onSearch={setQuery} className="-mt-1" />
      {search ? (
        <SearchResults query={search} />
      ) : (
        <>
          <Link href={tourHref} className={cx("mt-4 flex items-center gap-3.5 rounded-lg bg-surface py-3.5 pr-3 pl-3.5", rowFocus)}>
            <span className="flex size-16 shrink-0 items-center justify-center rounded-[14px] bg-illus-bg">
              <HelpIcon name="house" size={40} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-headline text-ink">Så funkar {appName}</span>{" "}
              <span className="mt-0.5 block text-meta text-ink-2">Rundturen igen, sex bilder, en minut.</span>
            </span>
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
              <PlayIcon size={20} />
            </span>
          </Link>
          {/* 18 px above the chips, as in the model: 16 here and the row's own 2. */}
          <div className="mt-4">
            <ChipRow ref={chipRow} role="group" aria-label="Område">
              {helpAreas.map((candidate) => (
                <Chip
                  key={candidate.id}
                  selected={candidate.id === area.id}
                  aria-pressed={candidate.id === area.id}
                  aria-controls="hjalp-omrade"
                  onClick={() => choose(candidate.id)}
                >
                  {candidate.title}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <AreaBody area={area} />
          <h2 id="tyck-till" className={sectionLabel}>
            Tyck till
          </h2>
          <ListGroup labelledBy="tyck-till" inset={58}>
            {feedbackRows.map((row) => (
              <li key={row.kind}>
                <Link
                  href={feedbackHref(row.kind)}
                  scroll={false}
                  onClick={openFeedback}
                  data-testid={`feedback-${row.kind}`}
                  className={cx("flex min-h-[52px] items-center gap-3 px-4 py-1.5", rowFocus)}
                >
                  <span aria-hidden="true" className={cx("flex size-[30px] shrink-0 items-center justify-center rounded-[8px]", row.tile)}>
                    <HelpIcon name={row.icon} size={20} className="" />
                  </span>
                  <span className="min-w-0 flex-1 text-row-title font-normal text-ink">{row.title}</span>
                  <ChevronRightIcon size={16} className="-mr-1 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ListGroup>
          <p className="mt-6 text-center text-[13px] leading-[18px] text-ink-3">
            {appName} {version} · uppdaterad {day} {months[month - 1]}
          </p>
        </>
      )}
      {/* The address is read in the browser only, so the page itself stays static. */}
      <Suspense fallback={null}>
        <FeedbackFromAddress ownerName={ownerName} />
      </Suspense>
    </div>
  );
}

/**
 * The Tyck till sheet the address asks for (`?tyck=idea|rate|problem`, Story 20.3), with
 * the search word (`&q=`) as the start of an idea. The area of Hjälp's `#…` (the tab it
 * was opened from, or the chip chosen since) is chosen in the sheet, and the tab is the
 * page it says it was sent from. Closing it takes `tyck` and `q` off the address and
 * keeps the `#…`.
 */
function FeedbackFromAddress({ ownerName }: { ownerName: string | null }) {
  const params = useSearchParams();
  const asked = params?.get("tyck") ?? null;
  const kind = isFeedbackSheetKind(asked) ? asked : null;
  const [opened, setOpened] = useState<{ kind: FeedbackSheetKind; area: FeedbackAreaId | null; page: string } | null>(null);

  // The hash is only in the browser, so the sheet opens once it has been read.
  useEffect(() => {
    const hash = window.location.hash;
    const area = hash.replace(/^#/, "");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is read only in the browser.
    setOpened(kind ? { kind, area: isFeedbackArea(area) ? area : null, page: sentFromPage(hash) } : null);
  }, [kind]);

  function close() {
    const next = new URLSearchParams(window.location.search);
    next.delete("tyck");
    next.delete("q");
    const query = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }

  return (
    <FeedbackSheet
      kind={opened?.kind ?? null}
      onClose={close}
      ownerName={ownerName}
      area={opened?.area ?? null}
      initialText={params?.get("q")?.slice(0, 200) ?? ""}
      page={opened?.page ?? null}
    />
  );
}

/** One area: its three steps (side by side on a desktop) and its questions as `<details>`. */
function AreaBody({ area }: { area: HelpArea }) {
  return (
    <div id="hjalp-omrade" aria-label={area.title} role="region">
      <h2 className={sectionLabel}>Så gör du</h2>
      <ol role="list" className="grid overflow-hidden rounded-lg bg-surface desktop:grid-cols-3">
        {area.steps.map((step, index) => (
          <li
            key={step.title}
            className={cx(
              "relative flex items-start gap-3.5 py-3.5 pr-4 pl-3.5",
              "desktop:flex-col desktop:items-center desktop:gap-2.5 desktop:px-5 desktop:pt-6 desktop:pb-[22px] desktop:text-center",
              index > 0 &&
                "before:absolute before:top-0 before:right-0 before:left-14 before:border-t before:border-hairline before:content-[''] desktop:border-l desktop:border-hairline desktop:before:hidden",
            )}
          >
            <HelpIcon name={step.icon} size={28} className="mt-px text-accent desktop:mt-0" />
            <div className="min-w-0 flex-1">
              <h3 className="text-row-title text-ink">{step.title}</h3>
              <p className={cx("mt-0.5", smallText)}>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <h2 className={sectionLabel}>Vanliga frågor</h2>
      <ul role="list" className="overflow-hidden rounded-lg bg-surface">
        {area.faq.map((item, index) => (
          <li
            key={item.question}
            className={cx(index > 0 && "relative before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-hairline before:content-['']")}
          >
            <details className="group">
              <summary
                className={cx(
                  "flex min-h-14 cursor-pointer list-none items-center gap-3 py-2.5 pr-3 pl-4 [&::-webkit-details-marker]:hidden",
                  rowFocus,
                )}
              >
                <span className="min-w-0 flex-1 text-row-title text-ink">{item.question}</span>
                <PlusMinusIcon />
              </summary>
              <p className="-mt-1 pr-14 pb-3.5 pl-4 text-[15px] leading-[22px] text-ink-2">{item.answer}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The text with the searched words underlined in `--warm`. */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="bg-transparent font-semibold text-inherit underline decoration-warm decoration-2 underline-offset-3">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** The steps and questions of every area that match, and the way to say what is missing. */
function SearchResults({ query }: { query: string }) {
  const hits = searchHelp(query);
  return (
    <>
      <p role="status" className={sectionLabel}>
        {hits.length} {hits.length === 1 ? "träff" : "träffar"}
      </p>
      {hits.length > 0 ? (
        <ListGroup label="Träffar" inset={16}>
          {hits.map((hit) => (
            <li key={`${hit.area.id}-${hit.title}`} className="px-4 py-3">
              <p className="text-[13px] leading-[18px] font-medium text-ink-3">
                {hit.area.title} · {hit.kind === "step" ? "Så gör du" : "Fråga"}
              </p>
              <p className="mt-0.5 text-row-title text-ink">
                <Highlighted text={hit.title} query={query} />
              </p>
              <p className={cx("mt-0.5", smallText)}>
                <Highlighted text={hit.text} query={query} />
              </p>
            </li>
          ))}
        </ListGroup>
      ) : null}
      <p className="px-4 pt-5 pb-2 text-center text-[15px] leading-[22px] text-ink-2">
        Hittar du inte svaret?
        <br />
        <Link
          href={feedbackHref("idea", query)}
          scroll={false}
          onClick={openFeedback}
          data-testid="feedback-idea"
          className="mt-0.5 inline-flex min-h-tap items-center rounded-md px-1 font-medium text-accent outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          Berätta vad du letar efter
        </Link>
      </p>
    </>
  );
}
