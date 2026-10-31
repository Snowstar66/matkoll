import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { AiSettingInput, AiSettingsView } from "../domain/ai-choice";
import { AiSettings } from "./ai-settings";

const saveAiSetting = vi.fn<(input: AiSettingInput) => Promise<Result<AiSettingInput>>>();
vi.mock("../actions/save-ai-setting", () => ({ saveAiSetting: (input: AiSettingInput) => saveAiSetting(input) }));

const haiku = { provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" } as const;
const withKey: AiSettingsView = {
  effective: haiku,
  isDefault: true,
  claudeAvailable: true,
  qwenAvailable: true,
  qwenModel: "qwen/test",
  defaultText: "Qwen lokalt (qwen/test)",
};
const withoutKey: AiSettingsView = { ...withKey, effective: null, claudeAvailable: false };

function renderSection(view: AiSettingsView) {
  return render(
    <ToastProvider>
      <AiSettings view={view} />
    </ToastProvider>,
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  saveAiSetting.mockReset().mockImplementation(async (input) => ok(input));
});

describe("AiSettings", () => {
  it("shows Haiku 5.5 and Medel chosen when the default is used with a key", () => {
    renderSection(withKey);
    expect(radio("Claude")).toBeChecked();
    expect(radio("Haiku 5.5")).toBeChecked();
    expect(radio("Medel")).toBeChecked();
    expect(screen.getByTestId("ai-default-note")).toHaveTextContent("Claude Haiku 5.5, Medel");
  });

  it("lists an estimated cost per call for every Claude model", () => {
    renderSection(withKey);
    expect(screen.getByText(/ca 0,03 kr per import/)).toBeInTheDocument();
    expect(screen.getByText(/ca 0,50 kr per import/)).toBeInTheDocument();
    expect(screen.getByText(/ca 1 kr per import/)).toBeInTheDocument();
  });

  it("turns Claude off with the key text when the key is missing, and shows Qwen with the level off", () => {
    renderSection(withoutKey);
    expect(screen.getByTestId("ai-claude-missing")).toHaveTextContent("Lägg in ANTHROPIC_API_KEY i .env.local och starta om");
    expect(radio("Claude")).toBeDisabled();
    expect(radio("Qwen lokalt")).toBeChecked();
    expect(radio("Låg")).toBeDisabled();
    expect(screen.getByText("Nivån gäller bara Claude. För Qwen är den avstängd.")).toBeInTheDocument();
    expect(screen.getByTestId("ai-default-note")).toHaveTextContent("Qwen lokalt (qwen/test)");
  });

  it("saves a new model and level at once", async () => {
    const user = userEvent.setup();
    renderSection(withKey);
    await waitFor(() => expect(radio("Opus 5.5")).toBeEnabled());
    await user.click(radio("Opus 5.5"));
    await waitFor(() =>
      expect(saveAiSetting).toHaveBeenLastCalledWith({ provider: "anthropic", model: "claude-opus-5-5", effort: "medium" }),
    );
    await waitFor(() => expect(radio("Hög")).toBeEnabled());
    await user.click(radio("Hög"));
    await waitFor(() =>
      expect(saveAiSetting).toHaveBeenLastCalledWith({ provider: "anthropic", model: "claude-opus-5-5", effort: "high" }),
    );
  });

  it("saves Qwen without a level", async () => {
    const user = userEvent.setup();
    renderSection(withKey);
    await waitFor(() => expect(radio("Qwen lokalt")).toBeEnabled());
    await user.click(radio("Qwen lokalt"));
    await waitFor(() => expect(saveAiSetting).toHaveBeenCalledWith({ provider: "lmstudio" }));
    expect(await screen.findByText("qwen/test")).toBeInTheDocument();
  });

  it("goes back and says so when saving fails", async () => {
    saveAiSetting.mockResolvedValue(fail("settings_save_failed"));
    const user = userEvent.setup();
    renderSection(withKey);
    await waitFor(() => expect(radio("Sonnet 5.5")).toBeEnabled());
    await user.click(radio("Sonnet 5.5"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara ändringen");
    await waitFor(() => expect(radio("Haiku 5.5")).toBeChecked());
  });
});
