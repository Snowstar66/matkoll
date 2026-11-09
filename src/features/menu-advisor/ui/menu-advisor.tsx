"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AiWorking } from "@/components/ai-working";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { CameraIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Segment } from "@/components/segment";
import { useOption } from "@/lib/use-option";
import { prepareMenuPhoto, readMenuPhoto, type MenuReading } from "../actions/read-menu";
import { allergyDisclaimer } from "../domain/disclaimer";
import { MenuResult } from "./menu-result";
import { TonightList } from "./tonight-list";
import { useTonight } from "./use-tonight";
import { AvoidPanel } from "./avoid-panel";
import { CompanyPanel } from "./company-panel";
import { usePeople } from "./use-people";
import { type HouseholdPerson, meId } from "../domain/people";
import type { Person } from "../domain/profile";
import type { MenuAllergen } from "../domain/types";
import type { MenuMode } from "../domain/view";

// Menyrådgivare (Tillval, off by default): photograph or pick a photo of a menu, have it read by the AI
// (POST /api/menu/read), and get it explained in Swedish, optionally marked against what you avoid right now.
// Nothing is saved except "Ikväll", the dishes starred in this session. The photo stays in memory only.

type Stage = { name: "start" } | { name: "reading"; careful: boolean; keep: MenuReading | null } | { name: "result"; reading: MenuReading };

const noopSubscribe = () => () => {};

/** `members`: the household's members (read on the server), pickable as company from the start; null = not readable. */
export function MenuAdvisor({ members = null }: { members?: readonly HouseholdPerson[] | null }) {
  const enabled = useOption("menuAdvisor");
  // Off on the server and during hydration: nothing flashes for people who have it on.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [stage, setStage] = useState<Stage>({ name: "start" });
  const [mode, setMode] = useState<MenuMode>("help");
  const [avoid, setAvoid] = useState<MenuAllergen[]>([]);
  const [dislikes, setDislikes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTonight, setShowTonight] = useState(false);
  const tonight = useTonight();
  const { people, save } = usePeople(members);
  // Who is with tonight: ids of saved people plus guests added for tonight only (gone when the page closes).
  const [selectedIds, setSelectedIds] = useState<string[]>([meId]);
  const [tempGuests, setTempGuests] = useState<Person[]>([]);
  const photo = useRef<Blob | null>(null);
  const request = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => () => request.current?.abort(), []);

  if (!mounted) return null;
  if (!enabled) {
    return (
      <Notice
        action={
          <Link href="/installningar/tillval" className="inline-flex min-h-tap items-center pl-3 font-semibold underline">
            Öppna Tillval
          </Link>
        }
      >
        Menyrådgivaren är avstängd. Slå på den under Inställningar, Tillval.
      </Notice>
    );
  }

  async function run(blob: Blob, careful: boolean, keep: MenuReading | null) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setStage({ name: "reading", careful, keep });
    const answer = await readMenuPhoto(blob, careful ? "careful" : "standard", controller.signal);
    if (request.current !== controller) return;
    request.current = null;
    if (answer.ok) return setStage({ name: "result", reading: answer.data });
    // Stopped by "Avbryt": back to where it was.
    if (answer.error === undefined) return setStage(keep ? { name: "result", reading: keep } : { name: "start" });
    // The dev text of ai_unavailable ("Är datorn med modellen igång?") is not for someone at a restaurant.
    setError(answer.error.code === "ai_unavailable" ? "Det gick inte att läsa menyn just nu. Försök igen." : answer.error.message);
    setStage(keep ? { name: "result", reading: keep } : { name: "start" });
  }

  async function takePhoto(file: File) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setStage({ name: "reading", careful: false, keep: null });
    const prepared = await prepareMenuPhoto(file);
    if (request.current !== controller) return;
    request.current = null;
    if (!prepared.ok) {
      setError(prepared.error.message);
      setStage({ name: "start" });
      return;
    }
    photo.current = prepared.data;
    await run(prepared.data, false, null);
  }

  function cancel(keep: MenuReading | null) {
    request.current?.abort();
    request.current = null;
    setStage(keep ? { name: "result", reading: keep } : { name: "start" });
  }

  const modeSegment = (
    <Segment<MenuMode>
      label="Vad vill du göra?"
      value={mode}
      onChange={setMode}
      options={[
        { value: "help", label: "Hjälp mig välja" },
        { value: "explain", label: "Bara förklara" },
      ]}
    />
  );
  const company = [...people, ...tempGuests].filter((person) => selectedIds.includes(person.id));
  const avoidPanel =
    mode === "help" ? (
      <>
        <CompanyPanel
          people={people}
          selectedIds={selectedIds}
          onSelectedIds={setSelectedIds}
          tempGuests={tempGuests}
          onTempGuests={setTempGuests}
          onSave={save}
        />
        <AvoidPanel avoid={avoid} onAvoid={setAvoid} dislikes={dislikes} onDislikes={setDislikes} />
      </>
    ) : null;
  const disclaimer = (
    <p data-testid="menu-disclaimer" className="rounded-md bg-fill px-3 py-2 text-meta text-ink-2">
      {allergyDisclaimer}
    </p>
  );
  const fileInput = (
    // No `capture`: the phone offers the camera and the album in one tap.
    <input
      ref={picker}
      type="file"
      accept="image/*"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="menu-file"
      className="sr-only"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void takePhoto(file);
      }}
    />
  );
  const pick = () => picker.current?.click();

  let content: ReactNode;
  if (showTonight) {
    content = (
      <TonightList
        picks={tonight.picks}
        onRemove={tonight.toggle}
        onClear={tonight.clear}
        onBack={() => setShowTonight(false)}
        onNext={() => {
          setShowTonight(false);
          setStage({ name: "start" });
          pick();
        }}
      />
    );
  } else if (stage.name === "reading") {
    content = (
      <div className="flex flex-col gap-4" data-testid="menu-reading">
        <div className="py-6">
          <AiWorking label={stage.careful ? "Läser menyn noggrannare …" : "Läser menyn …"} />
          {stage.careful ? <p className="mt-2 text-meta text-ink-2">Det här tar längre tid, upp till ett par minuter.</p> : null}
        </div>
        <Button variant="secondary" fullWidth onClick={() => cancel(stage.keep)}>
          Avbryt
        </Button>
      </div>
    );
  } else if (stage.name === "result") {
    const reading = stage.reading;
    content = (
      <MenuResult
        reading={reading}
        mode={mode}
        avoid={avoid}
        dislikes={dislikes}
        modeSegment={modeSegment}
        avoidPanel={avoidPanel}
        disclaimer={disclaimer}
        error={error}
        tonight={tonight}
        people={company}
        onTonight={() => setShowTonight(true)}
        onCareful={() => photo.current && void run(photo.current, true, reading)}
        onNext={pick}
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">Fota menyn eller välj ett foto. Appen läser den, förklarar rätterna på svenska och räknar om priserna.</p>
        {modeSegment}
        {avoidPanel}
        {error ? <Notice role="alert">{error}</Notice> : null}
        <Button fullWidth data-testid="menu-photo" onClick={pick}>
          <CameraIcon size={20} />
          Fota eller välj menyfoto
        </Button>
        {tonight.picks.length > 0 ? (
          <Chip selected={false} onClick={() => setShowTonight(true)} count={tonight.picks.length} className="self-start">
            Ikväll
          </Chip>
        ) : null}
        {disclaimer}
      </div>
    );
  }
  return (
    <>
      {content}
      {fileInput}
    </>
  );
}
