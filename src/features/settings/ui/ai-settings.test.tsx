import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { AiSettingInput, AiSettingsView } from "../domain/ai-choice";
import { AiSettings } from "./ai-settings";

const saveAiSetting = vi.fn<(input: AiSettingInput, password: string) => Promise<Result<AiSettingInput>>>();
vi.mock("../actions/save-ai-setting", () => ({
  saveAiSetting: (input: AiSettingInput, password: string) => saveAiSetting(input, password),
}));
const verifyAiPassword = vi.fn<(password: string) => Promise<Result<true>>>();
vi.mock("../actions/verify-ai-password", () => ({ verifyAiPassword: (password: string) => verifyAiPassword(password) }));

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

async function unlock(user: ReturnType<typeof userEvent.setup>, password = "frasse") {
  await waitFor(() => expect(screen.getByRole("button", { name: "Lås upp för att ändra" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Lås upp för att ändra" }));
  await user.type(screen.getByLabelText("Lösenord"), password);
  await user.click(screen.getByRole("button", { name: /^Lås upp$/ }));
}

beforeEach(() => {
  saveAiSetting.mockReset().mockImplementation(async (input) => ok(input));
  verifyAiPassword.mockReset().mockImplementation(async (password) => (password === "frasse" ? ok(true) : fail("validation")));
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
    await unlock(user);
    await waitFor(() => expect(radio("Opus 5.5")).toBeEnabled());
    await user.click(radio("Opus 5.5"));
    await waitFor(() =>
      expect(saveAiSetting).toHaveBeenLastCalledWith({ provider: "anthropic", model: "claude-opus-5-5", effort: "medium" }, "frasse"),
    );
    await waitFor(() => expect(radio("Hög")).toBeEnabled());
    await user.click(radio("Hög"));
    await waitFor(() =>
      expect(saveAiSetting).toHaveBeenLastCalledWith({ provider: "anthropic", model: "claude-opus-5-5", effort: "high" }, "frasse"),
    );
  });

  it("saves Qwen without a level", async () => {
    const user = userEvent.setup();
    renderSection(withKey);
    await unlock(user);
    await waitFor(() => expect(radio("Qwen lokalt")).toBeEnabled());
    await user.click(radio("Qwen lokalt"));
    await waitFor(() => expect(saveAiSetting).toHaveBeenCalledWith({ provider: "lmstudio" }, "frasse"));
    expect(await screen.findByText("qwen/test")).toBeInTheDocument();
  });

  it("goes back and says so when saving fails", async () => {
    saveAiSetting.mockResolvedValue(fail("settings_save_failed"));
    const user = userEvent.setup();
    renderSection(withKey);
    await unlock(user);
    await waitFor(() => expect(radio("Sonnet 5.5")).toBeEnabled());
    await user.click(radio("Sonnet 5.5"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att spara ändringen");
    await waitFor(() => expect(radio("Haiku 5.5")).toBeChecked());
  });

  it("is read-only until unlocked, and a wrong password says so and keeps it locked", async () => {
    const user = userEvent.setup();
    renderSection(withKey);
    expect(radio("Opus 5.5")).toBeDisabled();
    expect(radio("Hög")).toBeDisabled();
    expect(radio("Haiku 5.5")).toBeChecked();
    await unlock(user, "fel");
    expect(await screen.findByText("Fel lösenord.")).toBeInTheDocument();
    expect(verifyAiPassword).toHaveBeenCalledWith("fel");
    expect(radio("Opus 5.5")).toBeDisabled();
    expect(saveAiSetting).not.toHaveBeenCalled();
  });

  it("unlocks with the right password and keeps the controls open", async () => {
    const user = userEvent.setup();
    renderSection(withKey);
    await unlock(user);
    expect(await screen.findByTestId("ai-unlocked")).toBeInTheDocument();
    expect(screen.queryByLabelText("Lösenord")).not.toBeInTheDocument();
    await waitFor(() => expect(radio("Opus 5.5")).toBeEnabled());
  });
});
