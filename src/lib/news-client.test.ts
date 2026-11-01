import { describe, expect, it, vi } from "vitest";
import { hashKey } from "./news";
import { createNewsClient, type NewsEnv } from "./news-client";

// Brickor (Story 23.1): the device's side. Last seen per tab, the device's own
// changes left out, the tab that is open never counted, and a stale answer
// never bringing seen news back.

const serverNow = Date.UTC(2026, 10, 1, 9);

function setup(news: { lista?: string[]; prylar?: string[] } = {}, deviceNow = serverNow - 2_000) {
  const storage = new Map<string, string>();
  const answers: { lista: string[]; prylar: string[] }[] = [];
  const asked: string[] = [];
  let pending: ((response: Response) => void)[] = [];
  let hold = false;
  const env: NewsEnv = {
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      asked.push(String(input));
      const body = { ok: true, data: { now: new Date(serverNow).toISOString(), news: answers.shift() ?? { lista: news.lista ?? [], prylar: news.prylar ?? [] } } };
      const response = Response.json(body);
      if (!hold) return response;
      return new Promise<Response>((resolve) => pending.push(() => resolve(response)));
    }) as unknown as typeof fetch,
    now: () => deviceNow,
    read: (key) => storage.get(key) ?? null,
    write: (key, value) => void storage.set(key, value),
  };
  const client = createNewsClient(env);
  return {
    client,
    storage,
    asked,
    answers,
    seen: () => JSON.parse(storage.get("livskoll.news.seen") ?? "{}") as Record<string, number>,
    holdAnswers: () => {
      hold = true;
    },
    release: () => {
      for (const resolve of pending) resolve(new Response());
      pending = [];
    },
  };
}

describe("the news client", () => {
  it("starts a tab never seen at the server's time, so what was there before is not news", async () => {
    const { client, asked, seen } = setup({ lista: ["item:1"] });
    await client.refresh();
    expect(asked[0]).toBe("/api/news?");
    expect(seen()).toEqual({ lista: serverNow, prylar: serverNow });
    expect(client.getSnapshot()).toEqual({ lista: ["item:1"], prylar: [] });
  });

  it("asks for news after last seen and counts what others added, never this device's own", async () => {
    const { client, asked, answers } = setup();
    await client.refresh();
    client.noteOwn("item:mine");
    answers.push({ lista: ["item:mine", "item:theirs", "check:r:1"], prylar: ["card:p1"] });
    await client.refresh();
    expect(asked[1]).toContain(`lista=${encodeURIComponent(new Date(serverNow).toISOString())}`);
    expect(client.getSnapshot()).toEqual({ lista: ["item:theirs", "check:r:1"], prylar: ["card:p1"] });
    // Noting a change takes it off a badge that already shows it.
    client.noteOwn("card:p1");
    expect(client.getSnapshot().prylar).toEqual([]);
  });

  it("keeps only a hash of an own change in storage", () => {
    const { client, storage } = setup();
    client.noteOwn("check:t:kaffe");
    expect(storage.get("livskoll.news.own")).toContain(hashKey("check:t:kaffe"));
    expect(storage.get("livskoll.news.own")).not.toContain("kaffe");
  });

  it("never counts the tab that is open, and marks a tab seen when it opens and when it is left, in the server's time", async () => {
    const deviceNow = serverNow - 60_000;
    const { client, answers, seen } = setup({}, deviceNow);
    await client.refresh();
    answers.push({ lista: ["item:a"], prylar: ["card:b"] });
    client.setCurrent("lista");
    await client.refresh();
    expect(client.getSnapshot()).toEqual({ lista: [], prylar: ["card:b"] });
    client.setCurrent("prylar");
    expect(client.getSnapshot()).toEqual({ lista: [], prylar: [] });
    // Last seen is the device's time moved to the server's clock (the device is a minute behind).
    expect(seen().lista).toBe(serverNow);
    client.setCurrent(null);
    client.leave();
    expect(seen().prylar).toBe(serverNow);
  });

  it("drops an answer that was asked for before the tab was seen", async () => {
    const { client, answers, holdAnswers, release } = setup();
    await client.refresh();
    holdAnswers();
    answers.push({ lista: ["item:old"], prylar: [] });
    const reading = client.refresh();
    client.setCurrent("lista");
    client.setCurrent(null);
    release();
    await reading;
    expect(client.getSnapshot().lista).toEqual([]);
  });

  it("keeps what it shows when a read fails", async () => {
    const { client } = setup({ lista: ["item:1"] });
    await client.refresh();
    const failing = createNewsClient({
      fetch: vi.fn(async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
      now: () => 0,
      read: () => null,
      write: () => {},
    });
    await failing.refresh();
    expect(failing.getSnapshot()).toEqual({ lista: [], prylar: [] });
    expect(client.getSnapshot().lista).toEqual(["item:1"]);
  });
});
