"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/button";
import { CameraIcon, CloseIcon } from "@/components/icons";
import {
  cameraProblem,
  cameraProblemText,
  fallbackCameraText,
  quickCameraText,
  removeShotText,
  sendQueue,
  sendShotsLabel,
  shotCountText,
  shotsReducer,
  shutterText,
  startingCameraText,
  type CameraProblem,
  type Shot,
} from "../domain/quick-camera";

// Snabbkamera (Story 18.10): a full-screen, always dark camera in the app, so a
// whole storeroom is tap, tap, tap instead of shutter, "Använd bild", "Ta ett
// till" for every photo. Each tap grabs a frame of the back camera at the
// stream's full size (with a short flash and a light buzz), the strip above the
// shutter shows the shots, an × drops one, and "Klar" hands them over in order;
// the caller sends them as cards the usual way (downscaled, one at a time).
// The camera stops on Avbryt, on Klar and while the page is hidden. Without a
// camera or permission a calm line offers today's "Ta foto" instead.

export type QuickCameraProps = {
  /** The room the cards are taken in, shown at the top. */
  room: string;
  onCancel: () => void;
  /** The photos, in the order they were taken. */
  onDone: (photos: File[]) => void;
  /** "Använd Ta foto": called in the tap itself, after the camera has closed, so an input can be clicked. */
  onFallback: () => void;
};

/** The longer side of a thumbnail in the strip. */
const thumbSide = 160;
const photoQuality = 0.92;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function cameraApi(): MediaDevices | null {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  return media?.getUserMedia ? media : null;
}

/** Stops every track of a stream: the camera light goes out. */
export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

export function QuickCamera({ room, onCancel, onDone, onFallback }: QuickCameraProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  // Bumped on every start and stop, so a camera that answers after a stop is stopped at once.
  const generation = useRef(0);
  const [shots, dispatch] = useReducer(shotsReducer<File>, [] as readonly Shot<File>[]);
  const shotsRef = useRef(shots);
  const [ready, setReady] = useState(false);
  // A browser without getUserMedia (an old one, or a page that is not https) has no camera to start.
  const [problem, setProblem] = useState<CameraProblem | null>(() => (cameraApi() ? null : "missing"));
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  const stop = useCallback(() => {
    generation.current += 1;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    const mine = ++generation.current;
    const media = cameraApi();
    if (!media) return;
    let stream: MediaStream;
    try {
      // The back camera, as large as it gives (an iPhone's 4:3 sensor); the photo is downscaled when it is sent.
      stream = await media.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 4032 }, height: { ideal: 3024 } } });
    } catch (error) {
      if (alive.current && mine === generation.current) setProblem(cameraProblem(error));
      return;
    }
    if (!alive.current || mine !== generation.current || document.visibilityState === "hidden") {
      stopStream(stream);
      return;
    }
    streamRef.current = stream;
    setProblem(null);
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      void video.play?.()?.catch(() => {});
    }
  }, []);

  // Open as a modal dialog (the page behind is inert), start the camera, and stop it when the camera closes.
  useEffect(() => {
    alive.current = true;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    void start();
    return () => {
      alive.current = false;
      stop();
      for (const shot of shotsRef.current) URL.revokeObjectURL(shot.thumb);
      if (dialog?.open) dialog.close();
    };
  }, [start, stop]);

  // The camera stops while the page is hidden (another app, the lock screen) and starts again when it shows.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") stop();
      else if (!problem) void start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stop);
    };
  }, [start, stop, problem]);

  // The newest shot is always in view at the end of the strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip) strip.scrollLeft = strip.scrollWidth;
  }, [shots.length]);

  function cancel() {
    stop();
    onCancel();
  }

  function done() {
    if (shots.length === 0) return;
    const photos = sendQueue(shots);
    stop();
    onDone(photos);
  }

  function fallback() {
    stop();
    // Closed first, so the input behind it is no longer inert when it is clicked in this tap.
    dialogRef.current?.close();
    onFallback();
  }

  function shoot() {
    const video = videoRef.current;
    if (!video || !ready || video.videoWidth === 0 || video.videoHeight === 0) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    const scale = thumbSide / Math.max(width, height);
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(width * scale));
    small.height = Math.max(1, Math.round(height * scale));
    small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
    setFlash((count) => count + 1);
    navigator.vibrate?.(10);
    void Promise.all([toBlob(canvas, photoQuality), toBlob(small, 0.7)]).then(([photo, thumb]) => {
      if (!photo || !alive.current) return;
      const id = crypto.randomUUID();
      const file = new File([photo], `snabbkamera-${id.slice(0, 8)}.jpg`, { type: "image/jpeg" });
      dispatch({ type: "add", shot: { id, photo: file, thumb: URL.createObjectURL(thumb ?? photo) } });
    });
  }

  function remove(shot: Shot<File>) {
    URL.revokeObjectURL(shot.thumb);
    dispatch({ type: "remove", id: shot.id });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={`${quickCameraText}, ${room}`}
      onCancel={(event) => {
        // Esc is Avbryt.
        event.preventDefault();
        cancel();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-camera-bg p-0 text-camera-ink open:flex backdrop:bg-camera-bg"
      data-testid="quick-camera"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={cancel}
          className="flex min-h-tap items-center justify-self-start rounded-md px-3 text-row-title focus-visible:outline-2 focus-visible:outline-camera-ring"
        >
          Avbryt
        </button>
        <h2 className="max-w-[50vw] truncate text-headline">{room}</h2>
        <p role="status" className="justify-self-end px-3 text-row-title tabular-nums" data-testid="quick-camera-count">
          {shotCountText(shots.length)}
        </p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-hidden="true"
          onLoadedMetadata={() => setReady(true)}
          className="absolute inset-0 h-full w-full object-contain"
          data-testid="quick-camera-video"
        />
        {/* A new element per shot, so the flash plays again; with "Minska rörelse" it is never seen. */}
        {flash > 0 ? <div key={flash} aria-hidden="true" className="camera-flash pointer-events-none absolute inset-0 bg-camera-ink opacity-0" /> : null}
        {problem ? (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center" data-testid="quick-camera-problem">
            <CameraIcon size={40} aria-hidden="true" />
            <p className="max-w-sm text-body">{cameraProblemText(problem)}</p>
            <Button variant="primary" onClick={fallback} data-testid="quick-camera-fallback">
              {fallbackCameraText}
            </Button>
          </div>
        ) : !ready ? (
          <p className="absolute inset-0 flex items-center justify-center text-body">{startingCameraText}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        <ul ref={stripRef} aria-label="Tagna kort" className="flex min-h-[76px] gap-3 overflow-x-auto px-4 pt-3 pr-6" data-testid="quick-camera-strip">
          {shots.map((shot, index) => (
            <li key={shot.id} className="relative size-16 shrink-0">
              {/* An object URL of the shot: next/image cannot show it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot.thumb} alt={`Kort ${index + 1}`} className="size-16 rounded-sm object-cover" />
              <button
                type="button"
                aria-label={removeShotText(index)}
                onClick={() => remove(shot)}
                className="absolute -top-2.5 -right-2.5 flex size-7 items-center justify-center rounded-full bg-photo-chip text-camera-ink ring-1 ring-camera-ring before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-camera-ring"
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4">
          <span />
          <button
            type="button"
            aria-label={shutterText}
            onClick={shoot}
            disabled={!ready}
            className="flex size-[76px] items-center justify-center rounded-full border-4 border-camera-ring disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-camera-ring"
            data-testid="quick-camera-shutter"
          >
            <span className="size-[60px] rounded-full bg-camera-ink transition-transform active:scale-90" />
          </button>
          <button
            type="button"
            onClick={done}
            disabled={shots.length === 0}
            aria-label={sendShotsLabel(shots.length)}
            className="h-11 justify-self-end rounded-pill bg-accent px-5 text-headline text-on-accent disabled:bg-camera-control disabled:text-camera-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-camera-ring"
            data-testid="quick-camera-done"
          >
            Klar
          </button>
        </div>
      </div>
    </dialog>
  );
}
