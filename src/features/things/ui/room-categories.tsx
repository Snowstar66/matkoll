"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/cx";
import { Notice } from "@/components/notice";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { loadRoomCategoryThings } from "../actions/room-things";
import { thingTiles, type Thing, type ThingCategory } from "../domain/thing";
import { categoryToggleLabel } from "../domain/thing-room";
import { CardThings } from "./card-things";
import { useOpenCategories } from "./device-store";

// The room's things per category (Story 18.12): every category is folded in,
// with its emoji tile, name and count ("Skruv & beslag · 214"). A category
// reads and shows its rows only when it is opened, so a room with thousands of
// things never renders them all. Which categories are open is kept on the
// device. The rows of an open category are read again when the page is (a
// thing renamed or removed, a card added).

type Loaded = { things: Thing[] } | { error: string };

export type RoomCategoriesProps = {
  siteId: string;
  roomKey: string;
  categories: readonly { category: ThingCategory; things: number }[];
};

export function RoomCategories({ siteId, roomKey, categories }: RoomCategoriesProps) {
  const [stored, setStored] = useOpenCategories(siteId, roomKey);
  const open = stored ?? [];
  const [loaded, setLoaded] = useState<Partial<Record<ThingCategory, Loaded>>>({});
  const latest = useRef(0);

  // Reads the rows of the open categories, and again when the page's counts are new (a refresh).
  const openKey = open.join("|");
  useEffect(() => {
    const wanted = categories.filter((entry) => openKey.split("|").includes(entry.category)).map((entry) => entry.category);
    if (wanted.length === 0) return;
    const request = ++latest.current;
    void (async () => {
      const results = await Promise.all(
        wanted.map(async (category) => {
          let result: Result<Thing[]>;
          try {
            result = await loadRoomCategoryThings({ siteId, roomKey, category });
          } catch {
            result = fail("things_unavailable");
          }
          return [category, result.ok ? { things: result.data } : { error: errorMessages[result.error.code] }] as const;
        }),
      );
      if (request === latest.current) setLoaded((current) => ({ ...current, ...Object.fromEntries(results) }));
    })();
  }, [categories, openKey, siteId, roomKey]);

  function toggle(category: ThingCategory) {
    setStored(open.includes(category) ? open.filter((name) => name !== category) : [...open, category]);
  }

  if (categories.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="room-categories">
      {categories.map(({ category, things }) => {
        const isOpen = open.includes(category);
        const { icon, tile } = thingTiles[category];
        const rows = loaded[category];
        return (
          <section key={category} className="flex flex-col gap-2" data-testid="room-category">
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`room-cat-${category}`}
                aria-label={categoryToggleLabel(category, things)}
                onClick={() => toggle(category)}
                className="flex min-h-tap w-full items-center gap-3 rounded-md px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  aria-hidden="true"
                  className={cx("flex size-tile shrink-0 items-center justify-center rounded-sm text-tile-icon leading-none select-none", tile)}
                >
                  {icon}
                </span>
                <span aria-hidden="true" className="min-w-0 flex-1 text-section-label wrap-break-word text-ink-2">
                  {category}
                </span>
                <span aria-hidden="true" className="shrink-0 text-meta text-ink-2 tabular-nums">
                  {things}
                </span>
                <span aria-hidden="true" className="shrink-0 text-meta text-ink-3">
                  {isOpen ? "▴" : "▾"}
                </span>
              </button>
            </h3>
            <div id={`room-cat-${category}`} hidden={!isOpen}>
              {isOpen && rows && "things" in rows ? <CardThings things={rows.things} headings={false} aside /> : null}
              {isOpen && rows && "error" in rows ? <Notice role="alert">{rows.error}</Notice> : null}
              {isOpen && !rows ? <p className="px-1 text-body text-ink-2">Läser …</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
