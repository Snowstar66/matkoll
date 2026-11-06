import { normalizeIngredientText } from "@/features/catalog";
import { checkNowIdeas, nameMentionsOther } from "./now-ideas";

// "Nya idéer med extrapris": dishes built around this week's offers, told like
// a friend would (an intro and a why per dish). The dishes are real recipes
// (their lines are matched by the catalog as ever); what the code keeps honest
// here is what the words say: a name in `uses` must be on offer or at home
// (checkNowIdeas), and neither the title, the why nor the intro may name a main
// ingredient (nameMentionsOther) that is not. Pure, so it is tested without a
// database or a model.

/** One dish as the model told it. */
export type RawOfferIdea = { title: string; why: string; uses: string[] };

/** A dish that holds: what is really on offer or at home in `uses`, and the one thing it leans on that is neither. */
export type CheckedOfferIdea = { index: number; why: string; uses: string[]; missing: string[] };

/** Key of a name in the check: normalized, or just lower case when normalizing leaves nothing. */
function keyOf(name: string): string {
  return normalizeIngredientText(name) || name.trim().toLocaleLowerCase("sv");
}

/**
 * True when `key` is one of the offers: the offer's whole name, or one of its
 * words or the end of one ("korv" is on offer as "Falukorv").
 */
export function isOnOffer(key: string, offerNames: readonly string[]): boolean {
  if (key === "") return false;
  return offerNames.some((offer) => {
    const name = keyOf(offer);
    if (name === key) return true;
    return name.split(/[^\p{L}]+/u).some((word) => word === key || (key.length >= 3 && !key.includes(" ") && word.endsWith(key)));
  });
}

/**
 * The dishes that hold, and the intro if it holds.
 * - `atHome(key)` says if a name is at home (the pantry, a Basvara or a catalog match of one); offers are checked here.
 * - A dish leaves out when a name it uses is neither (checkNowIdeas moves it to `missing`, and more than one drops it),
 *   when it uses nothing, or when its title names a main ingredient it does not use.
 * - A `why` that names a main ingredient that is neither on offer nor at home is cleared (the dish stays, without it).
 * - The intro is cleared in the same way, over everything the kept dishes use and everything on offer.
 */
export function checkOfferIdeas(
  ideas: readonly RawOfferIdea[],
  intro: string,
  offerNames: readonly string[],
  atHome: (key: string) => boolean,
  homeNames: readonly string[],
  onDrop: (reason: "name") => void = () => {},
): { intro: string; ideas: CheckedOfferIdea[] } {
  const known = (key: string) => atHome(key) || isOnOffer(key, offerNames);
  const checked = checkNowIdeas(
    ideas.map((idea) => ({ name: idea.title, how: "", why: idea.why, kind: "rätt" as const, uses: idea.uses, missing: [] })),
    known,
    [...homeNames, ...offerNames.map(keyOf)],
    onDrop,
  );
  const offerKeys = offerNames.map(keyOf);
  const kept: CheckedOfferIdea[] = [];
  for (const idea of checked) {
    const index = ideas.findIndex((raw, position) => raw.title === idea.name && !kept.some((done) => done.index === position));
    if (index < 0) continue;
    const named = [...idea.uses, ...idea.missing, ...offerKeys];
    kept.push({
      index,
      why: nameMentionsOther(idea.why, named, homeNames) ? "" : idea.why,
      uses: idea.uses,
      missing: idea.missing,
    });
  }
  const named = [...kept.flatMap((idea) => [...idea.uses, ...idea.missing]), ...offerKeys];
  return { intro: kept.length > 0 && !nameMentionsOther(intro, named, homeNames) ? intro : "", ideas: kept };
}
