import { cx } from "@/components/cx";
import { CameraIcon, ChevronLeftIcon, ChevronRightIcon, ImageIcon, InfoIcon, TrashIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { BigButton, Headline, StickyFooter, TextLink, TopBack } from "./journey-parts";

/**
 * A page of the menu being photographed, held in this tab's memory only: `preparing` while the photo is made small,
 * `ready` with the photo and a thumbnail address (an object URL, let go when the page goes), `failed` when the photo
 * could not be used (`message` says why). `unreadable`: the last reading could not read this page.
 */
export type MenuPage = {
  id: string;
  status: "preparing" | "ready" | "failed";
  photo: Blob | null;
  url: string | null;
  message: string | null;
  unreadable: boolean;
};

const iconButton =
  "flex min-h-tap min-w-tap items-center justify-center rounded-md text-ink-2 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * "Menyns sidor": the photos taken so far, one per page of the menu, as thumbnails in page order ("Sida 2 av 3").
 * Nothing is read until "Läs menyn": a photo only adds a page. "Lägg till sida" takes the next one (the camera on a
 * phone), "Välj från album" picks one or several; a page can be moved earlier or later and removed, and one that
 * could not be used or read is taken again with "Ta om". At most `maxPages` pages.
 */
export function PagesScreen({
  pages,
  maxPages,
  costText,
  notice,
  onBack,
  onAdd,
  onAlbum,
  onRemove,
  onMove,
  onRetake,
  onRead,
}: {
  pages: readonly MenuPage[];
  maxPages: number;
  /** What a reading of these pages costs, in words ("Kostar ca 0,05 kr för 3 sidor ..."); left out when unknown. */
  costText: string | null;
  notice: string | null;
  onBack: () => void;
  /** "Lägg till sida": the camera on a phone, the file window on a computer. */
  onAdd: () => void;
  /** "Välj från album" (a phone only: on a computer "Lägg till sida" is the file window already). */
  onAlbum?: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, step: -1 | 1) => void;
  onRetake: (id: string) => void;
  onRead: () => void;
}) {
  const total = pages.length;
  const full = total >= maxPages;
  const canRead = pages.some((page) => page.status === "ready") && !pages.some((page) => page.status === "preparing");
  return (
    <div className="flex min-h-[calc(100dvh-var(--tab-bar-height)-1rem)] flex-1 flex-col gap-4 desktop:min-h-[calc(100dvh-4rem)]" data-testid="menu-pages">
      <TopBack onClick={onBack}>Tolka menyn</TopBack>
      <Headline sub="En bild per sida. Tryck Läs menyn när alla sidor är med.">Menyns sidor</Headline>
      {notice ? <Notice role="alert">{notice}</Notice> : null}
      <ol aria-label="Sidor" className="grid grid-cols-2 gap-3">
        {pages.map((page, index) => {
          const number = index + 1;
          const trouble = page.status === "failed" || page.unreadable;
          return (
            <li key={page.id} data-testid="menu-page" data-status={trouble ? "trouble" : page.status} className="flex min-w-0 flex-col gap-1.5">
              <div className={cx("relative aspect-[3/4] overflow-hidden rounded-lg border-2 bg-surface", trouble ? "border-danger/50" : "border-hairline")}>
                {page.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- an object URL of a photo in this tab's memory, which next/image cannot take
                  <img src={page.url} alt={`Sida ${number}`} className={cx("size-full object-cover", page.unreadable && "opacity-50")} />
                ) : (
                  <div role="img" aria-label={`Sida ${number}`} className="flex size-full items-center justify-center text-ink-3">
                    <ImageIcon size={32} />
                  </div>
                )}
                {page.status === "preparing" ? (
                  <p className="absolute inset-x-0 bottom-0 bg-bg/85 px-2 py-1 text-center text-meta text-ink-2">Förbereder…</p>
                ) : null}
              </div>
              <p className="px-1 text-meta font-medium text-ink" data-testid="menu-page-label">{`Sida ${number} av ${total}`}</p>
              {trouble ? (
                <p className="flex gap-1.5 px-1 text-meta text-ink-2" data-testid="menu-page-trouble">
                  <InfoIcon size={16} className="mt-0.5 shrink-0" />
                  {page.status === "failed" ? (page.message ?? "Bilden gick inte att använda.") : "Sidan gick inte att läsa."}
                </p>
              ) : null}
              <div className="flex items-center justify-between">
                <button type="button" className={iconButton} aria-label={`Flytta sida ${number} bakåt`} disabled={index === 0} onClick={() => onMove(page.id, -1)}>
                  <ChevronLeftIcon size={20} />
                </button>
                <button type="button" className={iconButton} aria-label={`Flytta sida ${number} framåt`} disabled={index === total - 1} onClick={() => onMove(page.id, 1)}>
                  <ChevronRightIcon size={20} />
                </button>
                <button type="button" className={iconButton} aria-label={`Ta bort sida ${number}`} onClick={() => onRemove(page.id)}>
                  <TrashIcon size={20} />
                </button>
              </div>
              {trouble ? (
                <button
                  type="button"
                  onClick={() => onRetake(page.id)}
                  aria-label={`Ta om sida ${number}`}
                  className="inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-body font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <CameraIcon size={18} className="shrink-0" />
                  Ta om
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {costText ? (
        <p className="px-1 text-meta text-ink-3" data-testid="menu-pages-cost">
          {costText}
        </p>
      ) : null}
      <StickyFooter>
        <BigButton data-testid="menu-read" disabled={!canRead} onClick={onRead}>
          Läs menyn
        </BigButton>
        {full ? (
          <p className="py-2 text-center text-meta text-ink-2" data-testid="menu-pages-full">{`Högst ${maxPages} sidor`}</p>
        ) : (
          <>
            <button
              type="button"
              data-testid="menu-add-page"
              onClick={onAdd}
              className="mt-1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-pill border border-border bg-surface px-6 text-headline font-semibold text-accent select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <CameraIcon size={20} className="shrink-0" />
              Lägg till sida
            </button>
            {onAlbum ? <TextLink onClick={onAlbum}>Välj från album</TextLink> : null}
          </>
        )}
      </StickyFooter>
    </div>
  );
}
