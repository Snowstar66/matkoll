import { describe, expect, it, vi } from "vitest";
import type { AiSettingsView } from "@/features/settings";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn() }));
vi.mock("@/features/pantry/server", () => ({ listPantrySitesWithCounts: vi.fn() }));
vi.mock("@/features/settings/server", () => ({ getAiSettingsView: vi.fn(), listRecipeSites: vi.fn(), listStores: vi.fn() }));

const { aiValueText, sitesCountText } = await import("./settings-menu-content");

const base: AiSettingsView = {
  effective: null,
  isDefault: false,
  claudeAvailable: true,
  qwenAvailable: true,
  qwenModel: "qwen/test",
  defaultText: "Qwen lokalt (qwen/test)",
};

describe("the values on the start page of Inställningar", () => {
  it("writes the AI choice short", () => {
    expect(aiValueText({ ...base, effective: { provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" } })).toBe(
      "Claude Haiku · Medel",
    );
    expect(aiValueText({ ...base, effective: { provider: "lmstudio", model: "qwen/test", effort: "medium" } })).toBe("Qwen lokalt");
    expect(aiValueText(base)).toBe("Qwen lokalt (qwen/test)");
  });

  it("counts the recipe sites", () => {
    expect(sitesCountText(4)).toBe("4 sajter");
    expect(sitesCountText(1)).toBe("1 sajt");
  });
});
