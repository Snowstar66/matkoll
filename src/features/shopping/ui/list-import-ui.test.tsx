import { render as renderBare, type RenderOptions, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { ShoppingLine } from "../domain/compute-list";
import type { CustomItemFormInput, CustomItemRow } from "../domain/custom-item";
import { AddItemHeaderButton, AddItemProvider } from "./add-item";
import type { MatchNames } from "./list-import";
import { ShoppingList } from "./shopping-list";

// Fota en lista and Klistra in en lista in Lägg till vara: the choices, the review and the save with "Ångra".

const addCustomItem = vi.fn<(input: CustomItemFormInput) => Promise<Result<CustomItemRow>>>();
const removeCustomItem = vi.fn<(id: string) => Promise<Result<CustomItemRow | null>>>();
vi.mock("../actions/add-custom-item", () => ({ addCustomItem: (input: CustomItemFormInput) => addCustomItem(input) }));
vi.mock("../actions/remove-custom-item", () => ({ removeCustomItem: (id: string) => removeCustomItem(id) }));
vi.mock("../actions/restore-custom-item", () => ({ restoreCustomItem: vi.fn() }));
vi.mock("../actions/set-checked", () => ({ setChecked: vi.fn(async (change: unknown) => ok(change)) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const downscaleImage = vi.fn<(file: Blob) => Promise<Result<Blob>>>();
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: (file: Blob) => downscaleImage(file) }));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AddItemProvider>
        <AddItemHeaderButton />
        {children}
      </AddItemProvider>
    </ToastProvider>
  );
}
const render = (ui: ReactElement, options?: RenderOptions) => renderBare(ui, { wrapper: Wrapper, ...options });

const planId = "33333333-3333-4333-8333-333333333333";
const kaffe = "44444444-4444-4444-8444-444444444444";
const gradde: ShoppingLine = {
  key: "r:gradde:dl",
  ingredientId: "gradde",
  label: "Grädde",
  amount: 3,
  unit: "dl",
  isVague: false,
  coverage: { kind: "missing" },
  section: "Mejeri",
  origins: ["d1"],
  checked: false,
  isCustom: false,
};
const plan = { id: planId, name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: { d1: "Krämig kycklinggryta" } };
const matchNames = vi.fn<MatchNames>();

function renderList() {
  return render(<ShoppingList plan={plan} lines={[gradde]} pantryUnavailable={false} matchNames={matchNames} />);
}

beforeEach(() => {
  window.localStorage.setItem("matkoll:basket-open", "0");
  addCustomItem.mockReset().mockImplementation(async (input) =>
    ok({ id: input.id!, planId: null, label: input.label, ingredientId: input.ingredientId ?? null, amount: null, unit: null }),
  );
  removeCustomItem.mockReset().mockResolvedValue(ok(null));
  matchNames.mockReset().mockImplementation(async (names) => ok(names.map((name) => (name.toLowerCase() === "kaffe" ? { id: kaffe, name: "Kaffe" } : null))));
  downscaleImage.mockReset().mockResolvedValue(ok(new Blob(["jpeg"], { type: "image/jpeg" })));
});
afterEach(() => vi.unstubAllGlobals());

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Lägg till vara" }));
  return screen.getByRole("dialog", { name: "Lägg till vara" });
}

describe("the two choices", () => {
  it("are small buttons under the field of Lägg till vara, and nowhere on the page itself", async () => {
    const user = userEvent.setup();
    renderList();
    expect(screen.queryByRole("button", { name: "Fota en lista" })).not.toBeInTheDocument();
    const sheet = await openSheet(user);
    expect(within(sheet).getByRole("button", { name: "Fota en lista" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Klistra in en lista" })).toBeInTheDocument();
  });
});

describe("Klistra in en lista", () => {
  async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole("button", { name: "Klistra in en lista" }));
    await user.click(screen.getByTestId("list-import-text"));
    await user.paste(text);
    await user.click(screen.getByRole("button", { name: "Läs listan" }));
  }

  it("reviews the lines, ticks all but what is on the list already, links the catalog and adds the ticked ones with Ångra", async () => {
    const user = userEvent.setup();
    renderList();
    await paste(user, "- mjölk\n2 dl grädde\n☐ kaffe");
    const rows = await screen.findAllByTestId("list-import-row");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual(["Mjölk", "Grädde", "Kaffe"]);
    expect(within(rows[1]!).getByText("Finns redan")).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    expect(within(rows[0]!).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    expect(within(rows[1]!).getByText("2 dl")).toBeInTheDocument();
    expect(matchNames).toHaveBeenCalledWith(["Mjölk", "Grädde", "Kaffe"]);

    await user.click(screen.getByRole("button", { name: "Lägg till 2 varor" }));
    await waitFor(() => expect(addCustomItem).toHaveBeenCalledTimes(2));
    const added = addCustomItem.mock.calls.map(([input]) => input);
    expect(added.map((input) => [input.label, input.ingredientId, input.amount, input.unit])).toEqual([
      ["Mjölk", null, "", ""],
      ["Kaffe", kaffe, "", ""],
    ]);
    expect((await screen.findAllByText("Lade till 2 varor på inköpslistan.")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "Lägg till från lista" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(removeCustomItem).toHaveBeenCalledTimes(2));
    expect(removeCustomItem.mock.calls.map(([id]) => id)).toEqual(added.map((input) => input.id));
  });

  it("lets a row be ticked and unticked, and counts the button from the ticks", async () => {
    const user = userEvent.setup();
    renderList();
    await paste(user, "mjölk\nkaffe");
    await user.click(await screen.findByRole("checkbox", { name: "Ta med Mjölk" }));
    expect(screen.getByRole("button", { name: "Lägg till 1 vara" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Ta med Kaffe" }));
    expect(screen.getByRole("button", { name: "Lägg till 0 varor" })).toBeDisabled();
  });

  it("adds nothing and comes back to the form with Avbryt", async () => {
    const user = userEvent.setup();
    renderList();
    await paste(user, "mjölk");
    await user.click(await screen.findByRole("button", { name: "Avbryt" }));
    expect(addCustomItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fota en lista" })).toBeInTheDocument();
  });

  it("says so when the text holds no item, and still adds the items when the catalog cannot be read", async () => {
    const user = userEvent.setup();
    matchNames.mockResolvedValue(fail("catalog_unavailable"));
    renderList();
    await paste(user, "- \n☐");
    expect(await screen.findByText("Hittade inga varor i texten. Skriv en vara per rad.")).toBeInTheDocument();
    await user.clear(screen.getByTestId("list-import-text"));
    await user.click(screen.getByTestId("list-import-text"));
    await user.paste("kaffe");
    await user.click(screen.getByRole("button", { name: "Läs listan" }));
    await user.click(await screen.findByRole("button", { name: "Lägg till 1 vara" }));
    await waitFor(() => expect(addCustomItem).toHaveBeenCalledTimes(1));
    expect(addCustomItem.mock.calls[0]![0].ingredientId).toBeNull();
  });

  it("keeps what is left when an item cannot be added, and says why", async () => {
    const user = userEvent.setup();
    addCustomItem.mockImplementationOnce(async (input) => ok({ id: input.id!, planId: null, label: input.label, ingredientId: null, amount: null, unit: null }));
    addCustomItem.mockImplementationOnce(async () => fail("shopping_save_failed"));
    renderList();
    await paste(user, "mjölk\nbröd\nsmör");
    await user.click(await screen.findByRole("button", { name: "Lägg till 3 varor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Lade till 1 vara på inköpslistan.");
    expect(screen.getAllByTestId("list-import-row").map((row) => row.querySelector("p")?.textContent)).toEqual(["Bröd", "Smör"]);
    expect(screen.getByRole("button", { name: "Lägg till 2 varor" })).toBeEnabled();
  });
});

describe("Fota en lista", () => {
  function answerWith(payload: unknown) {
    const fetchMock = vi.fn(async () => Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  async function choosePhoto(user: ReturnType<typeof userEvent.setup>) {
    await openSheet(user);
    const file = new File(["x"], "lista.png", { type: "image/png" });
    await user.upload(screen.getByTestId("list-import-file"), file);
  }

  it("sends the resized photo to the reading and shows its items in the review", async () => {
    const user = userEvent.setup();
    const fetchMock = answerWith(ok({ items: [{ name: "mjölk", amount: 2, unit: "liter" }, { name: "Kaffe", amount: null, unit: null }, { name: "Grädde", amount: null, unit: null }] }));
    renderList();
    await choosePhoto(user);
    const rows = await screen.findAllByTestId("list-import-row");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual(["Mjölk", "Kaffe", "Grädde"]);
    expect(within(rows[0]!).getByText("2 l")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Finns redan")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/shopping/read-list");
    expect((init.body as FormData).get("image")).toBeInstanceOf(Blob);
    expect(screen.getByRole("button", { name: "Lägg till 2 varor" })).toBeInTheDocument();
  });

  it("says so when the photo shows no item", async () => {
    const user = userEvent.setup();
    answerWith(ok({ items: [] }));
    renderList();
    await choosePhoto(user);
    expect(await screen.findByText("Hittade inga varor på bilden. Prova en skarpare bild, eller klistra in listan.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klistra in en lista" })).toBeInTheDocument();
  });

  it("shows the port's message when the AI cap is reached, and when the AI is away", async () => {
    const user = userEvent.setup();
    answerWith(fail("ai_cap_reached"));
    renderList();
    await choosePhoto(user);
    expect(await screen.findByText("Dagens AI-tak är nått – prova igen i morgon.")).toBeInTheDocument();
    answerWith(fail("ai_unavailable"));
    await user.upload(screen.getByTestId("list-import-file"), new File(["x"], "lista2.png", { type: "image/png" }));
    expect(await screen.findByText(/AI-tjänsten svarar inte/)).toBeInTheDocument();
  });

  it("shows why a photo could not be made small", async () => {
    const user = userEvent.setup();
    downscaleImage.mockResolvedValue(fail("image_unsupported"));
    const fetchMock = answerWith(ok({ items: [] }));
    renderList();
    await choosePhoto(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
