import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { PantrySite, SelectedSite } from "@/features/pantry";
import type { ShoppingLine } from "@/features/shopping";
import { ok, type Result } from "@/lib/errors";
import { ShoppingListView } from "./shopping-list-view";

// Inköpslista as the page shows it (Story 8.5): the line "Boende" and "Byt"
// beside the list. A switch made in the sheet is said once, by its
// confirmation; one made elsewhere is said by the list; and "Byt" waits
// while the list saves a check. The "server" gives the list for the selected
// place, as getShoppingList would after the action's revalidation.

type Selected = Result<{ site: { id: string; name: string } }>;
const selectPantrySite = vi.fn<(input: { id: string }) => Promise<Selected>>();
vi.mock("@/features/pantry/actions/select-pantry-site", () => ({
  selectPantrySite: (input: { id: string }) => selectPantrySite(input),
}));
/** A check as setChecked takes and gives it. */
type CheckChange = { planId: string; key: string; checked: boolean };
const setChecked = vi.fn<(change: CheckChange) => Promise<Result<CheckChange>>>();
vi.mock("@/features/shopping/actions/set-checked", () => ({ setChecked: (change: CheckChange) => setChecked(change) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const hemma: PantrySite = { id: "11111111-1111-4111-8111-111111111111", name: "Hemma", isSelected: true };
const stugan: PantrySite = { id: "22222222-2222-4222-8222-222222222222", name: "Stugan", isSelected: false };
const plan = { id: "33333333-3333-4333-8333-333333333333", name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: {} };

const line = (label: string): ShoppingLine => ({
  key: `r:${label.toLowerCase()}:förp`,
  label,
  amount: 1,
  unit: "förp",
  isVague: false,
  coverage: { kind: "missing" },
  section: "Skafferi",
  origins: [],
  checked: false,
  isCustom: false,
});
/** What each place lacks: ketchup at Stugan, senap and korv at Hemma. */
const linesFor: Record<string, ShoppingLine[]> = {
  [hemma.id]: [line("Korv"), line("Senap")],
  [stugan.id]: [line("Ketchup"), line("Korv")],
};

let server: PantrySite[] = [];
let publish: () => void = () => {};

function selectOnServer(id: string) {
  server = server.map((site) => ({ ...site, isSelected: site.id === id }));
}

function Page() {
  const [sites, setSites] = useState(server);
  useEffect(() => {
    publish = () => setSites([...server]);
  }, []);
  const selected = sites.find((site) => site.isSelected)!;
  const site: SelectedSite = { id: selected.id, name: selected.name, siteCount: sites.length };
  return (
    <ShoppingListView
      sites={sites}
      plan={plan}
      lines={linesFor[selected.id]}
      hiddenLines={[]}
      pantryUnavailable={false}
      site={site}
    />
  );
}

const live = () => screen.getByTestId("list-announcement");

beforeEach(() => {
  server = [hemma, stugan];
  setChecked.mockReset().mockImplementation(async (change) => ok(change));
  selectPantrySite.mockReset().mockImplementation(async ({ id }) => {
    selectOnServer(id);
    publish();
    return ok({ site: { id, name: server.find((site) => site.id === id)!.name } });
  });
});

describe("ShoppingListView", () => {
  it("says a switch made in the sheet once, by its confirmation, not by the list", async () => {
    const user = userEvent.setup();
    render(<Page />, { wrapper: ToastProvider });
    await user.click(screen.getByRole("button", { name: /^Boende: / }));
    const sheet = await screen.findByRole("dialog", { name: "Boende" });
    await user.click(within(sheet).getByRole("button", { name: /^Stugan/ }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Listan räknas nu mot Stugan.");
    expect(screen.getByRole("button", { name: /^Boende: / })).toHaveAccessibleName("Boende: Stugan");
    expect(screen.getByRole("checkbox", { name: /^Ketchup/ })).toBeInTheDocument();
    expect(live()).toHaveTextContent("");
  });

  it("lets the list say a switch made elsewhere, also after a quiet one", async () => {
    const user = userEvent.setup();
    render(<Page />, { wrapper: ToastProvider });
    await user.click(screen.getByRole("button", { name: /^Boende: / }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Stugan/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Boende: / })).toHaveAccessibleName("Boende: Stugan"));
    expect(live()).toHaveTextContent("");
    // Another device selects Hemma.
    await act(async () => {
      selectOnServer(hemma.id);
      publish();
    });
    expect(live()).toHaveTextContent("Listan räknas nu mot Hemma. 2 varor kvar.");
    // And Stugan again: not kept quiet by the earlier switch from the sheet.
    await act(async () => {
      selectOnServer(stugan.id);
      publish();
    });
    expect(live()).toHaveTextContent("Listan räknas nu mot Stugan. 2 varor kvar.");
  });

  it("lets Byt wait while a check is being saved", async () => {
    let answer!: (result: Result<CheckChange>) => void;
    setChecked.mockImplementation(
      () =>
        new Promise((done) => {
          answer = done;
        }),
    );
    const user = userEvent.setup();
    render(<Page />, { wrapper: ToastProvider });
    const byt = screen.getByRole("button", { name: /^Boende: / });
    expect(byt).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /^Senap/ }));
    await waitFor(() => expect(byt).toBeDisabled());
    await act(async () => answer(ok({ planId: plan.id, key: "r:senap:förp", checked: true })));
    await waitFor(() => expect(byt).toBeEnabled());
  });
});
