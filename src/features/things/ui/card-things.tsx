"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { removeThing, renameThing, restoreThing } from "../actions/thing-item";
import { groupByCategory, thingMeta, thingTiles, type Thing, type ThingCategory } from "../domain/thing";
import { cleanThingName, emptyNameText, maxThingNameChars, removedThingText, removeThingText, renameThingText } from "../domain/thing-edit";

// The things of a card under their categories (Stories 18.2 and 18.3), each a
// row to tap: a sheet renames that thing or removes just it (with "Ångra"),
// and the card, its date and the other things stay as they are. Quiet row
// cards, a category's emoji on a light tile; the tile is decoration and the
// category's name stands beside it.

function CategoryHeading({ category, count, id }: { category: ThingCategory; count: number; id: string }) {
  const { icon, tile } = thingTiles[category];
  return (
    <div className="flex items-center gap-3 px-1">
      <span
        aria-hidden="true"
        className={cx("flex size-tile shrink-0 items-center justify-center rounded-sm text-tile-icon leading-none select-none", tile)}
      >
        {icon}
      </span>
      <h3 id={id} className="min-w-0 flex-1 text-section-label wrap-break-word text-ink-2">
        {category}
      </h3>
      <span className="shrink-0 text-meta text-ink-2 tabular-nums">{count}</span>
    </div>
  );
}

export function CardThings({ things }: { things: readonly Thing[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  // Kept while the sheet closes, so its text does not blank during the animation.
  const [selected, setSelected] = useState<Thing | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const groups = groupByCategory(things);

  function openSheet(thing: Thing) {
    setSelected(thing);
    setName(thing.name);
    setError(null);
    setNotice(null);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    setNotice(null);
    const cleaned = cleanThingName(name);
    if (cleaned === "") {
      setError(emptyNameText);
      nameRef.current?.focus();
      return;
    }
    if (cleaned === selected.name) {
      setOpen(false);
      return;
    }
    setSaving(true);
    let result: Result<null>;
    try {
      result = await renameThing({ id: selected.id, name });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_item_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    if (result.error.code === "things_item_gone" || result.error.code === "unauthorized") router.refresh();
    if (result.error.fields?.name) {
      setError(result.error.fields.name);
      nameRef.current?.focus();
      return;
    }
    setNotice(result.error.message);
  }

  async function remove() {
    if (!selected || saving) return;
    const thing = selected;
    setSaving(true);
    let result: Awaited<ReturnType<typeof removeThing>>;
    try {
      result = await removeThing(thing.id);
    } catch {
      result = fail("things_item_failed");
      router.refresh();
    }
    setSaving(false);
    if (!result.ok) {
      if (result.error.code === "things_item_gone") router.refresh();
      setNotice(result.error.message);
      return;
    }
    const snapshot = result.data;
    setOpen(false);
    router.refresh();
    showToast(removedThingText(thing.name), {
      onUndo: () => {
        void (async () => {
          let restored: Result<null>;
          try {
            restored = await restoreThing(snapshot);
          } catch {
            restored = fail("things_restore_failed");
          }
          if (!restored.ok) showToast(restored.error.message, { role: "alert" });
          router.refresh();
        })();
      },
    });
  }

  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((group) => (
        <section key={group.category} className="flex flex-col gap-2" data-testid="thing-group">
          <CategoryHeading category={group.category} count={group.things.length} id={`cat-${group.category}`} />
          <ListGroup labelledBy={`cat-${group.category}`}>
            {group.things.map((thing) => (
              <ListRow
                key={thing.id}
                title={thing.name}
                meta={thingMeta(thing)}
                onPress={() => openSheet(thing)}
                pressProps={{ "aria-haspopup": "dialog", "data-testid": "thing-press" }}
                data-testid="thing"
              />
            ))}
          </ListGroup>
        </section>
      ))}
      <Sheet open={open} onClose={() => setOpen(false)} title="Pryl" subtitle={selected ? thingMeta(selected) || undefined : undefined} closeLabel="Avbryt" preventClose={saving}>
        <form onSubmit={save} noValidate aria-busy={saving || undefined} className="flex flex-col gap-4">
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-name`}>{renameThingText}</FieldLabel>
            <Input
              ref={nameRef}
              id={`${ids}-name`}
              name="name"
              autoComplete="off"
              maxLength={maxThingNameChars * 2}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-name-error` : undefined}
            />
            {error ? <FieldError id={`${ids}-name-error`}>{error}</FieldError> : null}
          </div>
          <Button type="submit" fullWidth aria-disabled={saving || undefined}>
            {saving ? "Sparar …" : "Spara"}
          </Button>
          <Button variant="text" fullWidth disabled={saving} onClick={remove}>
            {removeThingText}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
