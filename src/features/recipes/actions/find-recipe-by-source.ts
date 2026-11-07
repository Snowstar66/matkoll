"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * UX-23: the recipe already saved from this link, if any, so Importera recept
 * can say "finns redan" before the same link is read and saved twice. A read
 * action (AD-1: find*); the link is compared as written, with or without a
 * trailing slash. Fails with `unauthorized` or `validation`.
 */
export async function findRecipeBySource(url: string): Promise<Result<{ id: string; title: string } | null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed || trimmed.length > 2048) return fail("validation");
  const bare = trimmed.replace(/\/+$/, "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe")
    .select("id, title")
    .eq("source_kind", "url")
    .in("source_url", [...new Set([trimmed, bare, `${bare}/`])])
    .order("created_at", { ascending: false })
    .limit(1);
  // A failed check never blocks the import: it is only a warning.
  if (error || !data || data.length === 0) return ok(null);
  return ok({ id: data[0].id, title: data[0].title });
}
