import { afterEach, describe, expect, it, vi } from "vitest";
import { quietSound, resetSoundForTests, ring, unlockSound } from "./alarm-sound";

class FakeContext {
  static made = 0;
  state = "suspended";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  started: string[] = [];
  constructor() {
    FakeContext.made++;
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { buffer: null, connect: vi.fn(), start: () => this.started.push("silent") };
  }
  createOscillator() {
    return { type: "", frequency: { value: 0 }, connect: vi.fn(), start: () => this.started.push("tone"), stop: vi.fn() };
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
  }
}

afterEach(() => {
  resetSoundForTests();
  vi.unstubAllGlobals();
  FakeContext.made = 0;
});

describe("alarm sound", () => {
  it("is unlocked inside a tap: one context, resumed, with a silent sample", () => {
    vi.stubGlobal("AudioContext", FakeContext);
    unlockSound();
    unlockSound();
    expect(FakeContext.made).toBe(1);
  });

  it("does not ring before it was unlocked", () => {
    const audioSession = { type: "auto" };
    vi.stubGlobal("navigator", { ...navigator, audioSession });
    vi.stubGlobal("AudioContext", FakeContext);
    ring();
    expect(FakeContext.made).toBe(0);
    expect(audioSession.type).toBe("auto");
  });

  it("rings past the silent switch while ringing, and gives the audio back after", () => {
    const audioSession = { type: "auto" };
    vi.stubGlobal("navigator", { ...navigator, audioSession });
    vi.stubGlobal("AudioContext", FakeContext);
    unlockSound();
    ring();
    expect(audioSession.type).toBe("playback");
    quietSound();
    expect(audioSession.type).toBe("auto");
  });
});
