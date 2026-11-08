"use client";

// The timer alarm's sound, made with Web Audio (no sound file). iPhone rules it
// has to follow:
// - Sound is allowed only when the audio was started inside a tap, so
//   `unlockSound` runs on every tap of a timer button (and on any tap while
//   timers run, which covers timers read back after a reload): it makes the
//   context, resumes it and plays one silent sample.
// - Web Audio is muted by the silent switch unless the page's audio session is
//   "playback" (Safari 17+, `navigator.audioSession`). It is set only while the
//   alarm rings and set back to "auto" after, as "playback" pauses other audio
//   (music, a podcast) while it is on.
// - A web app cannot vibrate on iPhone, and nothing plays when the phone is
//   locked or the app is in the background; the recipe keeps the screen on.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

let context: AudioContext | null = null;

function setSession(type: "playback" | "auto") {
  try {
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session) session.type = type;
  } catch {
    // No audio session API here.
  }
}

/** Call inside a tap: lets the alarm play later. */
export function unlockSound() {
  if (typeof AudioContext === "undefined") return;
  try {
    context ??= new AudioContext();
    void context.resume?.();
    const silent = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = silent;
    source.connect(context.destination);
    source.start(0);
  } catch {
    // Web Audio missing or blocked: no sound.
  }
}

/** The page shows again: a context iOS interrupted while hidden is resumed (allowed once it was unlocked). */
export function resumeSound() {
  try {
    if (context && context.state !== "running") void context.resume?.();
  } catch {
    // Nothing to resume.
  }
}

/** One ring: three high-low pairs, as loud as the phone's volume allows. */
export function ring() {
  if (!context) return;
  setSession("playback");
  try {
    void context.resume?.();
    const start = context.currentTime + 0.05;
    for (let index = 0; index < 6; index++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = index % 2 === 0 ? 1320 : 990;
      const at = start + index * 0.18 + Math.floor(index / 2) * 0.12;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.9, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    }
  } catch {
    // No sound where Web Audio is missing or blocked.
  }
}

/** The alarm is over: other audio may play again. */
export function quietSound() {
  setSession("auto");
}

/** For tests: forget the context. */
export function resetSoundForTests() {
  context = null;
}
