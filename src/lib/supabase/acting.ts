import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// A request that is signed in by a token and not by cookies: the scheduled offers job signs in as a household
// member (its session, never the service role, AD-4) and asks POST /api/offer-ideas/prepare to prepare the ideas.
// Inside `actAsSession` the data layer's createClient() gives that session's client, so every read and write
// (pantry, offers, the AI setting, the set) runs as that member under RLS, with the code the signed-in flow uses.
// Only the Route Handler that checked the tokens sets it; nothing else can.
// after() callbacks and detached promises started inside `actAsSession` inherit the session too (AsyncLocalStorage).

type Acting = { db: SupabaseClient<Database> };

const store = new AsyncLocalStorage<Acting>();

/** The session client of the surrounding `actAsSession`, or `undefined` in an ordinary (cookie) request. */
export function actingClient(): SupabaseClient<Database> | undefined {
  return store.getStore()?.db;
}

/** Runs `work` with createClient() answering `db`, a client that already holds the member's session. */
export function actAsSession<T>(db: SupabaseClient<Database>, work: () => Promise<T>): Promise<T> {
  return store.run({ db }, work);
}
