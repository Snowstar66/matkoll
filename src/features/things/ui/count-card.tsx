"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { cx } from "@/components/cx";
import { Notice } from "@/components/notice";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { loadThingCount, restoreThingCount, setThingCount, stopThingCount, undoThingChange } from "../actions/thing-count";
import {
  changeDateText,
  changedText,
  changeRow,
  changesLabel,
  countLabel,
  countLine,
  countThisText,
  fixCountText,
  lessCountText,
  maxCount,
  moreCountText,
  notCountedText,
  outText,
  saveCountText,
  showAllChangesText,
  shownChanges,
  stopCountText,
  stoppedText,
  type CountSnapshot,
  type Changed,
  type ThingChange,
  type ThingCount,
} from "../domain/thing-count";
import { CountChips, CountStepRow, OpenCountStep, useCountStep, type CountChange } from "./count-actions";

// The count card in a föremål's sheet (Story 18.23), first in the sheet: the
// count, Ta and Fyll på, the line that says what Livskoll knows ("Du borde ha 3
// kvar · kortet 12 okt visade 5"), and the latest changes, newest first (five,
// then "Visa alla 8"). Under it Rätta antalet and Sluta räkna. A föremål
// without a count has "Antal · räknas inte" with Räkna. Everything is saved at
// once; no Spara. A change is confirmed in the card ("Tog 1 gravljus. Ångra"),
// since a toast would hide behind the sheet, and the sheet stays open.

type Done = { text: string; undo: () => Promise<void> };

/** The latest changes, newest first, with "Visa alla N". */
function Changes({ changes }: { changes: readonly ThingChange[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? changes : changes.slice(0, shownChanges);
  if (changes.length === 0) return null;
  return (
    <div className="border-t border-hairline pb-1.5">
      <h3 className="px-4 pt-3 pb-1 text-section-label text-ink-2">{changesLabel}</h3>
      <ul role="list" data-testid="count-changes">
        {shown.map((change) => {
          const row = changeRow(change);
          return (
            <li key={change.id} className="flex min-h-10 items-center gap-3 px-4" data-testid="count-change">
              <b className={cx("w-[30px] shrink-0 text-row-title tabular-nums", row.quiet ? "font-medium text-ink-2" : "font-semibold", row.plus ? "text-accent" : !row.quiet && "text-ink")}>
                {row.amount}
              </b>
              <span className="min-w-0 flex-1 text-body text-ink">{row.label}</span>
              <time dateTime={change.at} className="shrink-0 text-meta text-ink-3">
                {changeDateText(change.at)}
              </time>
            </li>
          );
        })}
      </ul>
      {!all && changes.length > shownChanges ? (
        <div className="px-2">
          <Button variant="compact" onClick={() => setAll(true)} data-testid="count-show-all">
            {showAllChangesText(changes.length)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** "Tog 1 gravljus." with Ångra, in the card where the line was. */
function DoneLine({ done, busy, onUndo }: { done: Done; busy: boolean; onUndo: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 pr-1 pb-1 pl-4" role="status" data-testid="count-done">
      <span className="text-meta text-ink">{done.text}</span>
      <Button variant="compact" disabled={busy} onClick={onUndo}>
        Ångra
      </Button>
    </div>
  );
}

export function CountCard({ itemId, name, initial }: { itemId: string; name: string; initial: number | null }) {
  const router = useRouter();
  const [count, setCount] = useState<ThingCount | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  // Räkna / Rätta antalet: the stepper with "Spara antal", from this value.
  const [setting, setSetting] = useState<number | null>(null);

  async function reload() {
    let result: Result<ThingCount>;
    try {
      result = await loadThingCount(itemId);
    } catch {
      result = fail("things_unavailable");
    }
    if (result.ok) setCount(result.data);
    else setProblem(errorMessages[result.error.code]);
  }

  useEffect(() => {
    let current = true;
    void (async () => {
      let result: Result<ThingCount>;
      try {
        result = await loadThingCount(itemId);
      } catch {
        result = fail("things_unavailable");
      }
      if (!current) return;
      if (result.ok) setCount(result.data);
      else setProblem(errorMessages[result.error.code]);
    })();
    return () => {
      current = false;
    };
  }, [itemId]);

  const quantity = count ? count.quantity : initial;
  const countId = count?.itemId ?? itemId;

  /** After a change: the card is read again (the history), and the page behind it. */
  async function after(text: string | null, undo: (() => Promise<void>) | null) {
    setProblem(null);
    setDone(text && undo ? { text, undo } : null);
    await reload();
    router.refresh();
  }

  const step = useCountStep(
    countId,
    (change: CountChange) => {
      setCount((current) => (current ? { ...current, quantity: change.quantity } : current));
      void after(changedText(change.kind, change.amount, name), async () => {
        let undone: Result<{ quantity: number }>;
        try {
          undone = await undoThingChange(change.changeId);
        } catch {
          undone = fail("things_restore_failed");
        }
        if (!undone.ok) setProblem(undone.error.message);
        await after(null, null);
      });
    },
    setProblem,
  );

  async function saveSet() {
    if (setting === null || busy) return;
    setBusy(true);
    let result: Result<Changed>;
    try {
      result = await setThingCount({ itemId: countId, quantity: setting });
    } catch {
      result = fail("things_count_failed");
    }
    setBusy(false);
    if (!result.ok) {
      setProblem(result.error.message);
      return;
    }
    setSetting(null);
    await after(null, null);
  }

  async function stop() {
    if (busy) return;
    setBusy(true);
    let result: Result<CountSnapshot>;
    try {
      result = await stopThingCount(countId);
    } catch {
      result = fail("things_count_failed");
    }
    setBusy(false);
    if (!result.ok) {
      setProblem(result.error.message);
      return;
    }
    const snapshot = result.data;
    await after(stoppedText(name), async () => {
      let restored: Result<null>;
      try {
        restored = await restoreThingCount(snapshot);
      } catch {
        restored = fail("things_restore_failed");
      }
      if (!restored.ok) setProblem(restored.error.message);
      await after(null, null);
    });
  }

  async function undo() {
    if (!done || busy) return;
    setBusy(true);
    await done.undo();
    setBusy(false);
  }

  const setRow =
    setting !== null ? (
      <CountStepRow
        value={setting}
        onValue={setSetting}
        max={maxCount}
        confirmLabel={saveCountText}
        busy={busy}
        onConfirm={saveSet}
        onCancel={() => setSetting(null)}
        fewerLabel={lessCountText}
        moreLabel={moreCountText}
        className="px-3 pb-3 pl-4"
      />
    ) : null;

  if (quantity === null) {
    return (
      <div className="flex flex-col gap-2" data-testid="count-card">
        {problem ? <Notice role="alert">{problem}</Notice> : null}
        <div className="overflow-hidden rounded-lg bg-bg">
          <div className="flex min-h-tap items-center gap-3 py-1.5 pr-3 pl-4">
            <span className="flex-1 text-body">
              <span className="font-medium text-ink">{countLabel}</span> <span className="text-ink-2">· {notCountedText}</span>
            </span>
            {setting === null ? (
              <Chip action selected={false} onClick={() => setSetting(1)} data-testid="count-start">
                {countThisText}
              </Chip>
            ) : null}
          </div>
          {setRow}
          {done ? <DoneLine done={done} busy={busy} onUndo={undo} /> : null}
        </div>
      </div>
    );
  }

  const changes = count?.changes ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="count-card">
      {problem ? <Notice role="alert">{problem}</Notice> : null}
      <div className="overflow-hidden rounded-lg bg-bg">
        <div className="flex items-center gap-2 pt-3 pr-3 pl-4">
          <p
            className={cx("m-0 flex-1 text-[28px] leading-[34px] font-semibold tracking-[-0.3px] tabular-nums", quantity === 0 ? "text-ink-2" : "text-ink")}
            data-testid="count-number"
          >
            {quantity === 0 ? (
              outText
            ) : (
              <>
                {quantity}
                <small className="ml-1 text-[17px] font-medium tracking-normal text-ink-2">st</small>
              </>
            )}
          </p>
          {step.mode || setting !== null ? null : (
            <span className="flex items-center gap-2">
              <CountChips step={step} quantity={quantity} />
            </span>
          )}
        </div>
        {step.mode ? <OpenCountStep step={step} quantity={quantity} className="px-3 pt-1 pb-3 pl-4" /> : null}
        {setRow}
        {done ? (
          <DoneLine done={done} busy={busy} onUndo={undo} />
        ) : (
          <p className="m-0 px-4 pt-0.5 pb-3 text-meta text-ink-2" data-testid="count-line">
            {count ? countLine(quantity, changes) : " "}
          </p>
        )}
        <Changes changes={changes} />
      </div>
      <div className="-my-2 -ml-2 flex gap-1">
        <Button variant="compact" disabled={busy || setting !== null} onClick={() => setSetting(Math.max(1, quantity))} data-testid="count-fix">
          {fixCountText}
        </Button>
        <Button variant="compact" disabled={busy} onClick={stop} data-testid="count-stop">
          {stopCountText}
        </Button>
      </div>
    </div>
  );
}
