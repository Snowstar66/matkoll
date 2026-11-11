import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReverseGeocoder, placeNameOf, resetReverseGeocoder, userAgent } from "./reverse-geocode";

const answer = (address: Record<string, string>) => new Response(JSON.stringify({ address }), { status: 200 });

beforeEach(() => {
  resetReverseGeocoder();
  vi.useRealTimers();
});

describe("placeNameOf", () => {
  it("gives the district and the town, from the address of Nominatim", () => {
    expect(placeNameOf({ suburb: "Luthagen", city: "Uppsala", municipality: "Uppsala kommun" })).toBe("Luthagen, Uppsala");
    expect(placeNameOf({ town: "Enköping", municipality: "Enköpings kommun" })).toBe("Enköping");
    expect(placeNameOf({ village: "Gamla Uppsala", municipality: "Uppsala kommun" })).toBe("Gamla Uppsala");
  });
  it("is null without a name and strips anything but letters, spaces and a few marks", () => {
    expect(placeNameOf({ road: "Storgatan" })).toBeNull();
    expect(placeNameOf({ city: "Lund<script>1" })).toBe("Lundscript");
  });
});

describe("createReverseGeocoder", () => {
  it("asks the fixed host with two-decimal numbers only and an identifying User-Agent, and returns the name", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => answer({ suburb: "Luthagen", city: "Uppsala" }));
    const lookup = createReverseGeocoder(fetchMock as never);
    expect(await lookup(59.86, 17.64)).toEqual({ ok: true, place: "Luthagen, Uppsala" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/reverse\?/);
    expect(String(url)).toContain("lat=59.86&lon=17.64");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(userAgent);
    expect(userAgent).toContain("Livskoll");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("caches the same rounded spot, so a repeat is not a second request", async () => {
    const fetchMock = vi.fn(async () => answer({ city: "Uppsala" }));
    const lookup = createReverseGeocoder(fetchMock as never);
    await lookup(59.86, 17.64);
    expect(await lookup(59.8604, 17.6404)).toEqual({ ok: true, place: "Uppsala" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("waits so that two different requests start at least a second apart", async () => {
    const starts: number[] = [];
    const fetchMock = vi.fn(async () => (starts.push(Date.now()), answer({ city: "Lund" })));
    const lookup = createReverseGeocoder(fetchMock as never);
    await Promise.all([lookup(55.7, 13.19), lookup(59.33, 18.07)]);
    expect(starts).toHaveLength(2);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(950);
  });
  it("fails quietly (no coordinates logged) on an error status, bad json, no name, a timeout or a throw", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = (response: () => Promise<Response>) => createReverseGeocoder(vi.fn(response) as never);
    expect(await failing(async () => new Response("x", { status: 429 }))(59.1, 17.1)).toEqual({ ok: false });
    expect(await failing(async () => new Response("not json"))(59.2, 17.2)).toEqual({ ok: false });
    expect(await failing(async () => answer({ road: "Storgatan" }))(59.3, 17.3)).toEqual({ ok: false });
    expect(await failing(async () => new Response("x".repeat(30_000)))(59.4, 17.4)).toEqual({ ok: false });
    expect(await failing(async () => Promise.reject(new DOMException("timeout", "TimeoutError")))(59.5, 17.5)).toEqual({ ok: false });
    expect(await createReverseGeocoder(vi.fn() as never)(Number.NaN, 1)).toEqual({ ok: false });
    for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toMatch(/59\.|17\./);
    log.mockRestore();
  });
});
