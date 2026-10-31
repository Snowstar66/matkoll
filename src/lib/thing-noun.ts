// The word for "a thing in Förråd" (Story 18.22): föremål, chosen over prylar,
// saker, grejer and ägodelar. Every user-visible form lives here, so a later
// rename is a change to this one file (and the AI prompts in
// src/server/ai/prompts/*.md and the tests' literals). Pure.

export const thingNoun = {
  /** "ett föremål" without the article. */
  singular: "föremål",
  /** With the article: "ett föremål". */
  indefinite: "ett föremål",
  /** "föremålet". */
  definite: "föremålet",
  /** "flera föremål". */
  plural: "föremål",
  /** "föremålen". */
  definitePlural: "föremålen",
} as const;

const up = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The same forms with a capital first letter, for the start of a sentence or a title. */
export const thingNounCap = {
  singular: up(thingNoun.singular),
  indefinite: up(thingNoun.indefinite),
  definite: up(thingNoun.definite),
  plural: up(thingNoun.plural),
  definitePlural: up(thingNoun.definitePlural),
} as const;

/** "74 föremål", or "1 föremål". */
export function thingCountText(count: number): string {
  return count === 1 ? `1 ${thingNoun.singular}` : `${count} ${thingNoun.plural}`;
}

/** "inga föremål". */
export const noThingNounText = `inga ${thingNoun.plural}`;
