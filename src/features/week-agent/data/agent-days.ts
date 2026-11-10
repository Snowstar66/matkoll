import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { WeekAgentDataError } from "./week-agent";

type Db = SupabaseClient<Database>;

/**
 * The weekdays (1-7) of a week whose dish an earlier "Använd veckan" put there (meal_plan_recipe.source =
 * 'week_agent'), so Matsedel's menu can say which dishes "Gör om" would replace and which are the household's own.
 * Empty when the week has no plan. RLS keeps it to the household's own rows. Throws WeekAgentDataError.
 */
export async function readAgentDaysIn(db: Db, weekStart: string): Promise<number[]> {
  const plan = await db.from("meal_plan").select("id").eq("week_start", weekStart).maybeSingle();
  if (plan.error) throw new WeekAgentDataError(`agent_days_plan_failed ${plan.error.code}`);
  if (!plan.data) return [];
  const rows = await db.from("meal_plan_recipe").select("weekday").eq("meal_plan_id", plan.data.id).eq("source", "week_agent").not("weekday", "is", null);
  if (rows.error) throw new WeekAgentDataError(`agent_days_read_failed ${rows.error.code}`);
  return [...new Set((rows.data ?? []).flatMap((row) => (row.weekday ? [row.weekday] : [])))].sort((a, b) => a - b);
}
