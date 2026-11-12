"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { errorMessages } from "@/lib/errors";
import { backfillRecipeImages } from "../actions/backfill-recipe-images";

export type RecipeImageStatus = { withCopy: number; missing: number };

/** The progress line: "12 av 40 recept har bilden hos oss." */
export function imageProgressText({ withCopy, missing }: RecipeImageStatus): string {
  const total = withCopy + missing;
  if (total === 0) return "Inga recept har någon bild att spara.";
  return `${withCopy} av ${total} recept har bilden hos oss.`;
}

/**
 * Inställningar, "Spara receptbilder hos oss": fetches the pictures of the household's existing
 * recipes into the app's own storage, a few at a time, with the progress shown and "Avbryt" to stop
 * between two steps. Never starts by itself. A recipe whose picture cannot be fetched keeps its
 * image address and is skipped for the rest of the run; running again tries it again. Recipe texts
 * are never read or changed.
 */
export function RecipeImageBackfill({ status }: { status: RecipeImageStatus }) {
  const router = useRouter();
  const [shown, setShown] = useState(status);
  const [read, setRead] = useState(status);
  if (read !== status) {
    setRead(status);
    setShown(status);
  }
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const cancelled = useRef(false);

  async function run() {
    if (running) return;
    cancelled.current = false;
    setRunning(true);
    setFailed(0);
    setMessage(null);
    setProblem(null);
    const skip: string[] = [];
    let stored = 0;
    try {
      for (;;) {
        const result = await backfillRecipeImages([...skip]);
        if (!result.ok) {
          setProblem(result.error.message);
          break;
        }
        const step = result.data;
        stored += step.stored;
        skip.push(...step.failedIds);
        setFailed(skip.length);
        setShown({ withCopy: step.withCopy, missing: step.missing });
        if (step.capReached) {
          setMessage("Hushållets utrymme för receptbilder är fullt. Ta bort några recept, så går det att spara fler.");
          break;
        }
        if (step.attempted === 0) {
          setMessage(
            skip.length > 0
              ? `Klart. ${skip.length} bilder gick inte att hämta och ligger kvar på sajten som förut.`
              : stored > 0
                ? "Klart. Alla bilder ligger hos oss."
                : "Inga bilder att spara.",
          );
          break;
        }
        if (cancelled.current) {
          setMessage("Avbröt. Det som hann sparas ligger kvar.");
          break;
        }
      }
    } catch {
      setProblem(errorMessages.recipe_images_failed);
    }
    setRunning(false);
    router.refresh();
  }

  const total = shown.withCopy + shown.missing;
  return (
    <section aria-labelledby="receptbilder-rubrik" className="mt-6 flex flex-col gap-3" data-testid="recipe-image-backfill">
      <h2 id="receptbilder-rubrik" className="mx-1 text-section-label text-ink-2 uppercase">
        Receptbilder
      </h2>
      <p className="px-1 desktop:px-0 text-meta text-ink-3">
        Nya recept sparar sin bild hos oss. Här sparar du bilderna till recept du redan har, så att de finns kvar även om sajten tar bort dem. Receptens
        texter ändras inte.
      </p>
      {problem ? <Notice role="alert">{problem}</Notice> : null}
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
        <p role="status" className="text-body text-ink" data-testid="recipe-image-progress">
          {imageProgressText(shown)}
          {failed > 0 && running ? ` ${failed} gick inte att hämta.` : ""}
        </p>
        {total > 0 ? (
          <progress value={shown.withCopy} max={total} aria-label="Bilder sparade hos oss" className="h-2 w-full accent-accent" />
        ) : null}
        {message ? <p className="text-meta text-ink-2">{message}</p> : null}
        <div className="flex gap-2">
          {running ? (
            <Button variant="secondary" onClick={() => (cancelled.current = true)}>
              Avbryt
            </Button>
          ) : (
            <Button onClick={() => void run()} disabled={shown.missing === 0}>
              Spara receptbilder hos oss
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
