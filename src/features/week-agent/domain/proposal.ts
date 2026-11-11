import { z } from "zod";
import { weekdaySchema } from "./settings";

// The proposal as stored (week_agent_proposals.proposal): parsed again on every read, so a stored shape the app
// does not know is refused instead of trusted.

const text = z.string().max(300);
const offerHit = z.object({ name: text, price: z.string().max(60).nullable(), store: z.string().max(80).nullable(), storeId: z.string().max(60).nullable().optional() });

export const proposalDaySchema = z.object({
  dayIndex: weekdaySchema,
  slot: z.enum(["dinner", "leftover", "skip"]),
  recipeId: z.uuid().nullable(),
  title: text.nullable(),
  source: z.enum(["fixed", "proposed"]),
  locked: z.boolean(),
  reasons: z.array(text).max(5),
  offerTags: z.array(offerHit).max(6),
  useSoonTags: z.array(z.object({ name: text, expiresWeekday: weekdaySchema.nullable(), estimated: z.boolean().optional(), today: z.boolean().optional() })).max(6),
  allergyWarning: text.nullable(),
});

export const weekProposalSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(proposalDaySchema).length(7),
});

export const proposalStatuses = ["draft", "used", "discarded"] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];


/**
 * What "Använd veckan" did, kept on the used draft (inside its `proposal` jsonb, next to `days`) so "Ångra" can take
 * exactly that back: the weekdays it wrote (the dish ids are dishIdFor(draft, day)) and the dishes it replaced.
 */
export const appliedWeekSchema = z.object({
  writtenDays: z.array(weekdaySchema).max(7),
  replaced: z
    .array(z.object({ id: z.uuid(), recipeId: z.uuid(), recipeTitle: text, servings: z.number().int().min(1).max(1000), weekday: weekdaySchema, source: z.enum(["user", "week_agent"]).nullable() }))
    .max(14),
});
export type AppliedWeek = z.infer<typeof appliedWeekSchema>;
