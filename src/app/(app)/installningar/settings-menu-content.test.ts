import { describe, expect, it, vi } from "vitest";
import type { AiSettingsView } from "@/features/settings";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "u", email: "pontus@example.se" })) }));
vi.mock("@/features/auth/ui/sign-out-button", () => ({ SignOutButton: () => null }));
vi.mock("@/features/pantry/server", () => ({ listPantrySitesWithCounts: vi.fn(async () => []) }));
vi.mock("@/features/settings/server", () => ({
  getAiSettingsView: vi.fn(async () => null),
  getAiMonthUsage: vi.fn(async () => null),
  listRecipeSites: vi.fn(async () => []),
  listStores: vi.fn(async () => []),
}));
const getOwnerInbox = vi.hoisted(() => vi.fn<() => Promise<{ unread: number } | null>>());
vi.mock("@/features/feedback/server", () => ({ getOwnerInbox }));

const { SettingsMenuContent, aiValueText, newCountText, sitesCountText } = await import("./settings-menu-content");

async function groupLabels() {
  const element = (await SettingsMenuContent()) as { props: { groups: { label: string; rows: { title: string; badge?: string }[] }[] } };
  return element.props.groups;
}

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

describe("the group Ägare (Story 20.3)", () => {
  it("is right under the account, with Inkorg and the count of new, for the owner", async () => {
    getOwnerInbox.mockResolvedValue({ unread: 3 });
    const groups = await groupLabels();
    expect(groups[0]).toMatchObject({ label: "Ägare", rows: [{ title: "Inkorg", badge: "3 nya" }] });
  });

  it("is not there at all for anyone else, or when it cannot be read", async () => {
    getOwnerInbox.mockResolvedValue(null);
    expect((await groupLabels()).map((group) => group.label)).not.toContain("Ägare");
    getOwnerInbox.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await groupLabels()).map((group) => group.label)).not.toContain("Ägare");
  });

  it("counts the new", () => {
    expect(newCountText(3)).toBe("3 nya");
    expect(newCountText(1)).toBe("1 ny");
    expect(newCountText(0)).toBeUndefined();
  });
});
