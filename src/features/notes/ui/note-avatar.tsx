import type { AvatarMood } from "../domain/note";

// The little character that performs a note (Story 24.2). Original artwork in
// plain SVG, moved by CSS (the .note-avatar rules in globals.css), so there is
// no animation library. `<NoteAvatar mood state />` is the whole interface: a
// Rive file could stand behind it later without the note card changing.
//
// The look is in the markup (the mood's brows, mouth, hearts, sweat drop and
// crossed arms are always drawn), the movement only in CSS under
// prefers-reduced-motion: no-preference. So with "Minska rörelse" the avatar
// stands still with its mood's face. Decoration: aria-hidden, the note's text
// is read from the note itself.

export type AvatarState = "idle" | "talking" | "pointing";

export type NoteAvatarProps = {
  mood: AvatarMood;
  state: AvatarState;
  /** The sender's shade for the shirt. */
  tone?: "mint" | "sky" | "sand" | "lila";
  size?: number;
};

/** The resting mouth of each mood (the talking mouth is a separate shape that opens and closes). */
const mouths: Record<AvatarMood, string> = {
  neutral: "M27 33.5 H37",
  glad: "M25 31.5 Q32 39 39 31.5",
  karleksfull: "M27 32 Q32 37.5 37 32",
  arg: "M26 35.5 Q32 30.5 38 35.5",
  stressad: "M26 34.5 Q29 32 32 34.5 T38 34.5",
};

/** Brows: angry ones slant down towards the nose, worried ones up towards it. */
const brows: Partial<Record<AvatarMood, [string, string]>> = {
  arg: ["M23 20.5 L29.5 23", "M41 20.5 L34.5 23"],
  stressad: ["M23 23 L29.5 20.5", "M41 23 L34.5 20.5"],
  glad: ["M23.5 20.5 Q26.5 18.5 29.5 20.5", "M34.5 20.5 Q37.5 18.5 40.5 20.5"],
};

export function NoteAvatar({ mood, state, tone = "mint", size = 56 }: NoteAvatarProps) {
  const brow = brows[mood];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className="note-avatar"
      data-mood={mood}
      data-state={state}
      data-tone={tone}
      data-testid="note-avatar"
    >
      <g className="na-body">
        <g className="na-shirt">
          <path d="M14 63 C14 49 21 43.5 32 43.5 C43 43.5 50 49 50 63 Z" />
        </g>
        {mood !== "arg" ? (
          <>
            <path className="na-arm" d="M17.5 47 L13 58" />
            {/* The arm that points: hangs by default, is raised and wags while pointing. */}
            <g className="na-arm-point">
              <path className="na-arm" d="M46.5 47 L52 57" />
              <circle className="na-hand" cx="52.5" cy="58" r="2.6" />
            </g>
          </>
        ) : (
          <g className="na-crossed">
            <path className="na-arm" d="M16 52 Q32 60 49 49" />
            <path className="na-arm" d="M48 52 Q32 60 15 49" />
            <circle className="na-hand" cx="49" cy="49" r="2.6" />
            <circle className="na-hand" cx="15" cy="49" r="2.6" />
          </g>
        )}
        <g className="na-head">
          <circle className="na-face" cx="32" cy="26" r="16" />
          <circle className="na-cheek" cx="22.5" cy="30" r="3" />
          <circle className="na-cheek" cx="41.5" cy="30" r="3" />
          <g className="na-eyes">
            <ellipse cx="26" cy="25" rx="1.9" ry="2.4" />
            <ellipse cx="38" cy="25" rx="1.9" ry="2.4" />
          </g>
          {brow ? (
            <g className="na-brows">
              <path d={brow[0]} />
              <path d={brow[1]} />
            </g>
          ) : null}
          <path className="na-mouth" d={mouths[mood]} />
          <ellipse className="na-mouth-talk" cx="32" cy="33.5" rx="4.2" ry="3.4" />
        </g>
      </g>
      {mood === "karleksfull" ? (
        <g className="na-hearts">
          <path className="na-heart na-heart-1" d="M52 14 c-1.6-2.6-5-1-3.8 1.6 c0.8 1.5 3.8 3.3 3.8 3.3 s3-1.8 3.8-3.3 c1.2-2.6-2.2-4.2-3.8-1.6 z" />
          <path className="na-heart na-heart-2" d="M10.5 18 c-1.2-2-3.8-0.8-2.9 1.2 c0.6 1.1 2.9 2.5 2.9 2.5 s2.3-1.4 2.9-2.5 c0.9-2-1.7-3.2-2.9-1.2 z" />
          <path className="na-heart na-heart-3" d="M44 5 c-1-1.7-3.2-0.7-2.5 1 c0.5 0.9 2.5 2.1 2.5 2.1 s1.9-1.2 2.5-2.1 c0.7-1.7-1.5-2.7-2.5-1 z" />
        </g>
      ) : null}
      {mood === "stressad" ? <path className="na-sweat" d="M50 12 C50 12 45.5 18 45.5 21 a4.5 4.5 0 0 0 9 0 C54.5 18 50 12 50 12 Z" /> : null}
    </svg>
  );
}
