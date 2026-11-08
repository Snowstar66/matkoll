import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { SwitchRow } from "@/components/switch-row";
import { fail, ok, type Result } from "@/lib/errors";
import { readOption, saveOption } from "@/lib/options";
import { useOption } from "@/lib/use-option";
import { SharingSettings, type RecipeSharing } from "./sharing-settings";

// Tillval, the group Delade recept: the device's Visa delade recept, the household's Dela alla
// mina recept and Sluta dela alla with its question (grey and ink, not red).

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const setShareAllRecipes = vi.fn<(share: boolean, householdName?: string) => Promise<Result<{ sharedCount: number }>>>();
const stopSharingAllRecipes = vi.fn<() => Promise<Result<{ stopped: number }>>>();
vi.mock("../actions/share-recipe", () => ({
  setShareAllRecipes: (share: boolean, householdName?: string) => setShareAllRecipes(share, householdName),
  stopSharingAllRecipes: () => stopSharingAllRecipes(),
}));

/** The device's row as the page gives it (settings' OptionRow for showShared). */
function ShowRow() {
  const on = useOption("showShared");
  return <SwitchRow label="Visa delade recept" hint="Recept som andra hushåll delar, under Recept" on={on} onToggle={() => saveOption("showShared", !on)} />;
}

function renderPage(sharing: RecipeSharing | null) {
  return render(
    <ToastProvider>
      <SharingSettings showRow={<ShowRow />} sharing={sharing} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  refresh.mockReset();
  setShareAllRecipes.mockReset().mockResolvedValue(ok({ sharedCount: 12 }));
  stopSharingAllRecipes.mockReset().mockResolvedValue(ok({ stopped: 3 }));
});

describe("SharingSettings", () => {
  it("has the device's row, the household's two, and its own note for the household", () => {
    renderPage({ shareAll: false, sharedCount: 3, nameIsDefault: false });
    expect(screen.getByRole("heading", { name: "Delade recept" })).toBeInTheDocument();
    const group = screen.getByTestId("shared-group");
    const show = within(group).getByRole("switch", { name: /^Visa delade recept/ });
    expect(show).toHaveAttribute("aria-checked", "true");
    expect(show).toHaveAccessibleDescription("Recept som andra hushåll delar, under Recept");
    const all = within(group).getByRole("switch", { name: /^Dela alla mina recept/ });
    expect(all).toHaveAttribute("aria-checked", "false");
    expect(all).toHaveAccessibleDescription("Även nya recept. Annars väljer du per recept.");
    expect(within(group).getByRole("button", { name: /Sluta dela alla/ })).toHaveTextContent("3 recept");
    expect(within(group).getByText("Dela alla och Sluta dela alla gäller hela hushållet.")).toBeInTheDocument();
  });

  it("turns Visa delade recept off on this device only", async () => {
    renderPage(null);
    await userEvent.click(screen.getByRole("switch", { name: /^Visa delade recept/ }));
    expect(readOption("showShared")).toBe(false);
    // Without the household's values only the device's row is there.
    expect(screen.queryByRole("switch", { name: /^Dela alla/ })).toBeNull();
  });

  it("turns Dela alla mina recept on for the household and shows how many are shared", async () => {
    renderPage({ shareAll: false, sharedCount: 0, nameIsDefault: false });
    expect(screen.queryByRole("button", { name: /Sluta dela alla/ })).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    expect(setShareAllRecipes).toHaveBeenCalledWith(true, undefined);
    expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Sluta dela alla/ })).toHaveTextContent("12 recept");
    expect(refresh).toHaveBeenCalled();
  });

  it("asks before Sluta dela alla, in grey and ink, and then stops all and turns Dela alla off", async () => {
    const user = userEvent.setup();
    renderPage({ shareAll: true, sharedCount: 3, nameIsDefault: false });
    await user.click(screen.getByRole("button", { name: /Sluta dela alla/ }));
    const sheet = await screen.findByRole("dialog", { name: "Sluta dela alla?" });
    expect(sheet).toHaveTextContent("3 recept slutar delas. Kopior som andra redan har sparat finns kvar hos dem.");
    expect(sheet).not.toHaveTextContent("Det går inte att ångra.");
    const confirm = within(sheet).getByRole("button", { name: "Sluta dela" });
    expect(confirm).toHaveClass("bg-fill", "text-ink!");
    expect(within(sheet).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
    await user.click(confirm);
    await vi.waitFor(() => expect(stopSharingAllRecipes).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: /Sluta dela alla/ })).toBeNull());
    expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "false");
  });

  it("asks what others should see the household as before Dela alla goes on while it has its default name", async () => {
    const user = userEvent.setup();
    renderPage({ shareAll: false, sharedCount: 0, nameIsDefault: true });
    await user.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    const sheet = await screen.findByRole("dialog", { name: "Vad ska andra se att ni heter?" });
    expect(setShareAllRecipes).not.toHaveBeenCalled();
    const field = within(sheet).getByRole("textbox", { name: "Hushållets namn" });
    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "Till exempel Hellgrens");
    expect(field).toHaveAttribute("maxlength", "60");
    await user.type(field, "Hellgrens");
    await user.click(within(sheet).getByRole("button", { name: "Spara och dela" }));
    await vi.waitFor(() => expect(setShareAllRecipes).toHaveBeenCalledWith(true, "Hellgrens"));
    await vi.waitFor(() => expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "true"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shares without a name on Hoppa över, and asks nothing when the name is chosen", async () => {
    const user = userEvent.setup();
    renderPage({ shareAll: false, sharedCount: 0, nameIsDefault: true });
    await user.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    const sheet = await screen.findByRole("dialog", { name: "Vad ska andra se att ni heter?" });
    await user.click(within(sheet).getByRole("button", { name: "Hoppa över" }));
    await vi.waitFor(() => expect(setShareAllRecipes).toHaveBeenCalledWith(true, undefined));
    await vi.waitFor(() => expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "true"));
  });

  it("keeps the name sheet open with the message when the name is refused, and asks for a name before saving", async () => {
    const user = userEvent.setup();
    setShareAllRecipes.mockResolvedValue(fail("validation", { name: "Högst 60 tecken." }));
    renderPage({ shareAll: false, sharedCount: 0, nameIsDefault: true });
    await user.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    const sheet = await screen.findByRole("dialog", { name: "Vad ska andra se att ni heter?" });
    await user.click(within(sheet).getByRole("button", { name: "Spara och dela" }));
    expect(within(sheet).getByText("Skriv ett namn, eller hoppa över.")).toBeInTheDocument();
    expect(setShareAllRecipes).not.toHaveBeenCalled();
    await user.type(within(sheet).getByRole("textbox", { name: "Hushållets namn" }), "Lång");
    await user.click(within(sheet).getByRole("button", { name: "Spara och dela" }));
    expect(await within(sheet).findByText("Högst 60 tecken.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "false");
  });

  it("does not ask for a name when turning Dela alla off", async () => {
    renderPage({ shareAll: true, sharedCount: 0, nameIsDefault: true });
    await userEvent.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(setShareAllRecipes).toHaveBeenCalledWith(false, undefined));
  });

  it("turns Dela alla off at once when nothing is shared", async () => {
    renderPage({ shareAll: true, sharedCount: 0, nameIsDefault: false });
    await userEvent.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(setShareAllRecipes).toHaveBeenCalledWith(false, undefined));
    expect(stopSharingAllRecipes).not.toHaveBeenCalled();
  });

  it("asks before turning Dela alla off while recipes are shared, and Sluta dela alla stops them all", async () => {
    const user = userEvent.setup();
    renderPage({ shareAll: true, sharedCount: 4, nameIsDefault: false });
    await user.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    const sheet = await screen.findByRole("dialog", { name: "Sluta dela de recept som delas nu?" });
    expect(sheet).toHaveTextContent("4 recept delas nu. Kopior som andra redan har sparat finns kvar hos dem.");
    expect(sheet).not.toHaveTextContent("Det går inte att ångra.");
    const confirm = within(sheet).getByRole("button", { name: "Sluta dela alla" });
    expect(confirm).toHaveClass("bg-fill", "text-ink!");
    expect(setShareAllRecipes).not.toHaveBeenCalled();
    await user.click(confirm);
    await vi.waitFor(() => expect(stopSharingAllRecipes).toHaveBeenCalled());
    expect(setShareAllRecipes).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "false"));
  });

  it("keeps the shared ones on Behåll dem and only turns Dela alla off", async () => {
    const user = userEvent.setup();
    setShareAllRecipes.mockResolvedValue(ok({ sharedCount: 4 }));
    renderPage({ shareAll: true, sharedCount: 4, nameIsDefault: false });
    await user.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    const sheet = await screen.findByRole("dialog", { name: "Sluta dela de recept som delas nu?" });
    await user.click(within(sheet).getByRole("button", { name: "Behåll dem" }));
    await vi.waitFor(() => expect(setShareAllRecipes).toHaveBeenCalledWith(false, undefined));
    expect(stopSharingAllRecipes).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByRole("button", { name: /Sluta dela alla/ })).toHaveTextContent("4 recept");
  });

  it("changes nothing when the question is cancelled", async () => {
    const user = userEvent.setup();
    renderPage({ shareAll: true, sharedCount: 4, nameIsDefault: false });
    await user.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    const sheet = await screen.findByRole("dialog", { name: "Sluta dela de recept som delas nu?" });
    await user.click(within(sheet).getByRole("button", { name: "Avbryt" }));
    expect(setShareAllRecipes).not.toHaveBeenCalled();
    expect(stopSharingAllRecipes).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "true");
  });

  it("says so when the household's switch cannot be saved, and keeps it", async () => {
    setShareAllRecipes.mockResolvedValue(fail("recipe_share_failed"));
    renderPage({ shareAll: false, sharedCount: 0, nameIsDefault: false });
    await userEvent.click(screen.getByRole("switch", { name: /^Dela alla mina recept/ }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Det gick inte att ändra delningen. Försök igen.");
    expect(screen.getByRole("switch", { name: /^Dela alla mina recept/ })).toHaveAttribute("aria-checked", "false");
  });
});
