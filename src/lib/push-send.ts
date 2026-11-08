import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import webpush from "web-push";
import { appName } from "@/app/app-info";
import { env } from "@/server/env";
import {
  type PushBatch,
  type PushKind,
  pushKinds,
  pushMaxWaitSeconds,
  type PushMessage,
  type EatSoonItem,
  eatSoonMessage,
  pushMessageFor,
  pushQuietSeconds,
} from "./push-message";
import { createClient } from "./supabase/server";
import type { Database } from "./supabase/database.types";

// Sending push notifications (Story 23.3). Shared code, since revalidateFor
// (after a write) starts it.
//
// The design, in short. Every change that is told about (a new item on the
// list, a new card in Förråd, a note, a change of the meal plan) adds one row
// to push_event through a trigger, whoever or whatever made it. After the
// write, schedulePushSend() waits in after() until the household has been
// quiet for pushQuietSeconds, then takes the due rows off the queue
// (claim_push_batches, with the session of whoever made the change: the
// service role is never in Vercel) and sends one notification per kind to the
// other members, never to the one who made the changes. Each change schedules
// such a wait; the last one finds the burst over and sends, the earlier ones
// find the queue empty or not yet quiet and do nothing. A function that dies
// (a deploy) leaves its rows in the queue; the next change, or any open
// device's news poll, sends them. No cron. Only counts are ever logged.

type Db = SupabaseClient<Database>;

/** A failed queue call. Holds a fixed reason and the database's code only. */
export class PushSendError extends Error {
  constructor(readonly detail: string) {
    super(`push_send: ${detail}`);
    this.name = "PushSendError";
  }
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** The VAPID keys, or null while they are not set: then nothing is sent and the settings page says so. */
export function pushConfig(): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const siteUrl = env.SITE_URL.startsWith("https://") ? env.SITE_URL : null;
  const subject = env.VAPID_SUBJECT ?? (env.OWNER_EMAIL ? `mailto:${env.OWNER_EMAIL}` : (siteUrl ?? "mailto:noreply@example.com"));
  return { publicKey, privateKey, subject };
}

/** A device to send a batch to. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string; batch: PushBatch };

/** What the push service answered for one device. */
export type SendOutcome = "sent" | "gone" | "failed";

export type SendPush = (target: PushTarget, message: PushMessage) => Promise<SendOutcome>;

/** Sends with web-push and the app's VAPID keys. Never throws: a refusal is an outcome (404 and 410 are `gone`). */
export function webPushSender(config: VapidConfig): SendPush {
  return async (target, message) => {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: 60 * 60 * 6 },
      );
      return "sent";
    } catch (error) {
      const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
      return status === 404 || status === 410 ? "gone" : "failed";
    }
  };
}

function isKind(value: string): value is PushKind {
  return (pushKinds as readonly string[]).includes(value);
}

/** Takes the household's due batches off the queue (one row per recipient device); see claim_push_batches in the migration. */
export async function claimBatchesIn(db: Db, quietSeconds: number, maxWaitSeconds: number): Promise<PushTarget[]> {
  const { data, error } = await db.rpc("claim_push_batches", { quiet: `${quietSeconds} seconds`, max_wait: `${maxWaitSeconds} seconds` });
  if (error) throw new PushSendError(`claim_failed ${error.code}`);
  return data.flatMap((row) =>
    isKind(row.kind)
      ? [{ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, batch: { kind: row.kind, count: row.n, actorName: row.actor_name, noteText: row.note_text } }]
      : [],
  );
}

/** Removes the devices the push service refused, among the household's members; the count that went. */
export async function dropSubscriptionsIn(db: Db, endpoints: string[]): Promise<number> {
  if (endpoints.length === 0) return 0;
  const { data, error } = await db.rpc("drop_push_subscriptions", { endpoints });
  if (error) throw new PushSendError(`drop_failed ${error.code}`);
  return data;
}

export type FlushResult = { sent: number; failed: number; dropped: number };

/**
 * Claims the household's due batches (the session `db` is a member's) and sends
 * them with `send`. A device the push service says is gone (permission taken
 * back, subscription expired) is removed without a word. Throws PushSendError.
 */
export async function flushPushBatchesIn(
  db: Db,
  send: SendPush,
  appTitle: string,
  quietSeconds: number = pushQuietSeconds,
  maxWaitSeconds: number = pushMaxWaitSeconds,
): Promise<FlushResult> {
  const targets = await claimBatchesIn(db, quietSeconds, maxWaitSeconds);
  const outcomes = await Promise.all(targets.map(async (target) => ({ target, outcome: await send(target, pushMessageFor(target.batch, appTitle)) })));
  const gone = outcomes.filter((entry) => entry.outcome === "gone").map((entry) => entry.target.endpoint);
  const dropped = await dropSubscriptionsIn(db, gone);
  return {
    sent: outcomes.filter((entry) => entry.outcome === "sent").length,
    failed: outcomes.filter((entry) => entry.outcome === "failed").length,
    dropped,
  };
}

export type EatSoonResult = { devices: number; sent: number; failed: number; dropped: number };

/**
 * The daily "Ät snart" (a scheduled job's request, as a member): sends one
 * notification about `items` (the household's due items) to every device of the
 * members who want it. The household's day is claimed first
 * (claim_eat_soon_devices): a second call the same day gets no devices, so
 * nothing is sent twice. Nothing due sends nothing and claims nothing. A device the push service says is gone is removed. Not part of the
 * queue. Throws PushSendError. Only counts are returned.
 */
export async function sendEatSoonIn(db: Db, items: readonly EatSoonItem[], send: SendPush, appTitle: string): Promise<EatSoonResult> {
  const message = eatSoonMessage(items, appTitle);
  if (!message) return { devices: 0, sent: 0, failed: 0, dropped: 0 };
  const { data, error } = await db.rpc("claim_eat_soon_devices");
  if (error) throw new PushSendError(`devices_failed ${error.code}`);
  // A target carries a batch for the sender's type; this kind has none of the queue's content.
  const batch: PushBatch = { kind: "lista", count: items.length, actorName: null, noteText: null };
  const outcomes = await Promise.all(
    data.map(async (device) => ({ endpoint: device.endpoint, outcome: await send({ endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth, batch }, message) })),
  );
  const gone = outcomes.filter((entry) => entry.outcome === "gone").map((entry) => entry.endpoint);
  const dropped = await dropSubscriptionsIn(db, gone);
  return {
    devices: data.length,
    sent: outcomes.filter((entry) => entry.outcome === "sent").length,
    failed: outcomes.filter((entry) => entry.outcome === "failed").length,
    dropped,
  };
}

async function flush(db: Db, config: VapidConfig): Promise<void> {
  try {
    const result = await flushPushBatchesIn(db, webPushSender(config), appName);
    if (result.sent + result.failed + result.dropped > 0) console.info("push_flush", result);
  } catch (error) {
    if (!(error instanceof PushSendError)) throw error;
    console.error("push_flush_failed", { reason: error.detail });
  }
}

/**
 * After a write that is told about: sends what is due once the household has
 * been quiet for a while. `wait` false skips the waiting (a poll that only
 * sends what is already due). Safe anywhere: outside a request, or without the
 * VAPID keys, nothing happens.
 */
export function schedulePushSend({ wait = true }: { wait?: boolean } = {}): void {
  const config = pushConfig();
  if (!config) return;
  try {
    // The session is read now, in the request: cookies are not available inside after().
    const clientPromise = createClient();
    clientPromise.catch(() => undefined);
    after(async () => {
      if (wait) await new Promise((resolve) => setTimeout(resolve, (pushQuietSeconds + 5) * 1000));
      await flush(await clientPromise, config);
    });
  } catch {
    // Not in a request (a unit test, a script): nothing to schedule.
  }
}
