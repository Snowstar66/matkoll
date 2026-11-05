import { beforeEach, describe, expect, it, vi } from "vitest";

const classifyNoteMood = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: async () => ({ classifyNoteMood }) }));

import { classifyNoteAvatarMood } from "./classify-mood";

describe("classifyNoteAvatarMood", () => {
  beforeEach(() => {
    classifyNoteMood.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("gives the mood the AI judged", async () => {
    classifyNoteMood.mockResolvedValue({ ok: true, data: { mood: "karleksfull" } });
    expect(await classifyNoteAvatarMood("Älskling, kan du handla?")).toBe("karleksfull");
    expect(classifyNoteMood.mock.calls[0]?.[0]).toEqual({ text: "Älskling, kan du handla?" });
  });

  it("gives null (a neutral avatar) when the AI fails, and never throws", async () => {
    classifyNoteMood.mockResolvedValue({ ok: false, error: { code: "ai_unavailable" } });
    expect(await classifyNoteAvatarMood("Hej")).toBeNull();
    classifyNoteMood.mockRejectedValue(new Error("boom"));
    expect(await classifyNoteAvatarMood("Hej")).toBeNull();
  });
});
