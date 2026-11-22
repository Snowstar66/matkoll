import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertAiUsageIn } from "@/features/settings/data/ai-usage";
import { loadCardViewIn } from "@/features/things/data/card-view";
import { insertPlaceIn } from "@/features/things/data/places";
import { insertCardIn, saveReadingIn, uploadCardFile } from "@/features/things/data/photos";
import { loadThingDetailIn } from "@/features/things/data/thing-detail";
import { parseWorthDetail } from "@/features/things/domain/thing-worth";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { ok } from "@/lib/errors";
import { createMockAiService } from "@/server/ai/adapters/mock";
import { withUsageSink } from "@/server/ai/usage";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// Undersök värdet (Värdetips) against local Supabase: a föremål with a tip asks for the fuller explanation, the
// mock AI answers (never a paid model) and it is kept on the föremål, so a second ask is read, not asked; one that is
// not the user's, or has no tip, is refused; the AI out of reach keeps nothing; thing_item_worth_detail_check holds
// the length; and another household can neither read nor write the explanation. Only a drawn photo.

let sessionDb: Db | undefined;
let sessionUser: { id: string; email: string } | undefined;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!sessionDb) throw new Error("No session client");
    return sessionDb;
  },
}));
vi.mock("@/features/auth/server", () => ({
  requireUser: async () => (sessionUser ? ok(sessionUser) : { ok: false, error: { code: "unauthorized", message: "" } }),
}));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
const mockAi = createMockAiService();
const explained = vi.fn();
vi.mock("@/features/settings/server", () => ({
  getAiServiceForUser: async () => ({
    ...mockAi,
    explainWorth: (...args: Parameters<typeof mockAi.explainWorth>) => {
      explained(args[0].name);
      const db = sessionDb;
      return withUsageSink((usage) => (db ? insertAiUsageIn(db, usage) : undefined), () => mockAi.explainWorth(...args));
    },
  }),
}));
const { explainThingWorth } = await import("@/features/things/actions/explain-worth");

const photo = new Uint8Array(readFileSync(new URL("../fixtures/ai/forrad.png", import.meta.url)));
const files: string[] = [];
let a: TestUser;
let b: TestUser;
let site: string | undefined;

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("worth-detail-a");
  b = await createTestUser("worth-detail-b");
});

afterAll(async () => {
  await adminClient().storage.from(thingPhotoBucket).remove(files);
  await deleteTestUsers();
});

const as = (user: TestUser) => {
  sessionDb = user.db;
  sessionUser = { id: user.id, email: user.email };
};

async function readingCard(): Promise<string> {
  if (!site) {
    const made = await a.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
    if (made.error) throw made.error;
    site = made.data.id;
  }
  const place = await insertPlaceIn(a.db, { siteId: site, room: "Boden", part: `Hylla ${randomUUID().slice(0, 8)}` });
  if (place.kind !== "saved") throw new Error(place.kind);
  const cardId = randomUUID();
  const path = thingPhotoPath(a.id, place.id, cardId, "image/png");
  await uploadCardFile(a.db, path, photo, "image/png");
  files.push(path);
  expect(await insertCardIn(a.db, { id: cardId, placeId: place.id, objectPath: path, mediaType: "image/png", width: 1200, height: 900, takenAt: new Date() })).toBe("saved");
  return cardId;
}

const hammerBox = { left: 0.197, top: 0.153, width: 0.14, height: 0.211 };
const tip = { why: "Liknar Orrefors. Titta på botten.", confidence: "guess" as const };

describe("Undersök värdet", () => {
  it("asks the AI once, keeps the explanation on the föremål, and reads it after that without a second call", async () => {
    const cardId = await readingCard();
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Hammare", category: "Verktyg", where: null, confidence: "high", box: hammerBox, worth: tip },
        { name: "Spade", category: "Trädgård", where: null, confidence: "high" },
      ],
      note: null,
      hidden: 0,
    });
    const [hammer] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    expect((await loadThingDetailIn(a.db, hammer.id))?.worth?.detail).toBeUndefined();
    as(a);
    explained.mockClear();

    const first = await explainThingWorth(hammer.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(parseWorthDetail(first.data.detail)?.checks.length).toBeGreaterThanOrEqual(2);
    expect(first.data.detail.length).toBeLessThanOrEqual(1500);
    expect(explained).toHaveBeenCalledTimes(1);
    expect((await loadThingDetailIn(a.db, hammer.id))?.worth).toEqual({ ...tip, detail: first.data.detail });

    // Kept: the second tap reads it, with the recommendation it holds.
    expect(await explainThingWorth(hammer.id)).toMatchObject({ ok: true, data: { detail: first.data.detail, recommends: true, applied: "unchanged" } });
    expect(explained).toHaveBeenCalledTimes(1);
    // Counted once in ai_usage, as the mock (no tokens, no cost).
    const usage = (await adminClient().from("ai_usage").select("id").eq("user_id", a.id)).data?.length ?? 0;
    expect(usage).toBeGreaterThanOrEqual(1);
  });

  it("examines a föremål without a tip too (no star: the recommendation is no), and refuses one that is not the household's", async () => {
    const cardId = await readingCard();
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Spade", category: "Trädgård", where: null, confidence: "high" },
        { name: "Kratta", category: "Trädgård", where: null, confidence: "high", worth: tip },
      ],
      note: null,
      hidden: 0,
    });
    const [spade, rake] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    as(a);
    explained.mockClear();
    expect(await explainThingWorth(spade.id)).toMatchObject({ ok: true, data: { recommends: false, applied: "unchanged", suggestion: null, state: { starred: false } } });
    expect(await explainThingWorth("not-an-id")).toMatchObject({ ok: false, error: { code: "validation" } });
    as(b);
    expect(await explainThingWorth(rake.id)).toMatchObject({ ok: false, error: { code: "things_item_gone" } });
    expect(explained).toHaveBeenCalledTimes(1);
  });

  it("keeps nothing when the AI is out of reach, so the next tap tries again", async () => {
    const cardId = await readingCard();
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [{ name: "Burk matkoll-mock: ai_unavailable", category: "Övrigt", where: null, confidence: "low", worth: tip }],
      note: null,
      hidden: 0,
    });
    const [jar] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    as(a);
    expect(await explainThingWorth(jar.id)).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect((await loadThingDetailIn(a.db, jar.id))?.worth?.detail).toBeUndefined();
  });

  it("holds the length in the column, and another household can neither write nor read the explanation", async () => {
    const cardId = await readingCard();
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [{ name: "Vas", category: "Hushåll", where: null, confidence: "high", worth: tip }],
      note: null,
      hidden: 0,
    });
    const [vase] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    expect((await a.db.from("thing_item").update({ worth_detail: "" }).eq("id", vase.id)).error).not.toBeNull();
    expect((await a.db.from("thing_item").update({ worth_detail: "x".repeat(1501) }).eq("id", vase.id)).error).not.toBeNull();
    expect((await a.db.from("thing_item").update({ worth_detail: "x".repeat(1500) }).eq("id", vase.id)).error).toBeNull();

    const stranger = await b.db.from("thing_item").update({ worth_detail: "Kapad" }).eq("id", vase.id).select("id");
    expect(stranger.data ?? []).toHaveLength(0);
    expect((await b.db.from("thing_item").select("worth_detail").eq("id", vase.id)).data ?? []).toHaveLength(0);
    expect((await a.db.from("thing_item").select("worth_detail").eq("id", vase.id).single()).data?.worth_detail).toBe("x".repeat(1500));
  });
});
