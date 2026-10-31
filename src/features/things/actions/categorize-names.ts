import "server-only";
import { getAiServiceForUser } from "@/features/settings/server";
import type { ThingCategory } from "../domain/thing";

// The one cheap text call that gives typed things a category (Stories 18.13 and
// 18.15, FR-24, AD-9): a few hundred characters in, a word per thing out. The AI
// choice of Inställningar applies and the call is counted like any other
// (Story 17.6). When the AI does not answer every thing is "Övrigt". Only a code
// is logged, never a name.

/** The time the model gets: well within the page's maxDuration of 60 s. */
const categorizeDeadlineMs = 25_000;

/** The categories of `names` in the same order, and whether the AI sorted them. */
export async function categorizeNames(names: readonly string[]): Promise<{ categories: ThingCategory[]; categorized: boolean }> {
  const fallback = names.map((): ThingCategory => "Övrigt");
  if (names.length === 0) return { categories: fallback, categorized: true };
  const answered = await (await getAiServiceForUser()).categorizeThings({ names: [...names] }, AbortSignal.timeout(categorizeDeadlineMs + 5_000), {
    deadline: Date.now() + categorizeDeadlineMs,
  });
  if (answered.ok) return { categories: answered.data.categories, categorized: true };
  console.error("things_categorize_failed", { code: answered.error.code });
  return { categories: fallback, categorized: false };
}
