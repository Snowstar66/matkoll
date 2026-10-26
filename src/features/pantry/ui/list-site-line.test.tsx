import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { PantrySite, SelectedSite } from "../domain/site";
import { ListSiteLine } from "./list-site-line";

// The line "Lager: Hemma" and "Byt" in Inköpslista, and the sheet Byt ställe
// (Story 8.5), with selectPantrySite stubbed. The "server" changes the
// selected place when the stub says so, as the action's revalidation would.

type Selected = Result<{ site: { id: string; name: string } }>;
const selectPantrySite = vi.fn<(input: { id: string }) => Promise<Selected>>();
vi.mock("../actions/select-pantry-site", () => ({
  selectPantrySite: (input: { id: string }) => selectPantrySite(input),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const hemma: PantrySite = { id: "11111111-1111-4111-8111-111111111111", name: "Hemma", isSelected: true };
const stugan: PantrySite = { id: "22222222-2222-4222-8222-222222222222", name: "Stugan", isSelected: false };
const torpet: PantrySite = { id: "33333333-3333-4333-8333-333333333333", name: "Torpet", isSelected: false };

/** Lets the stub select a place on the "server", as the revalidated page would show it. */
let selectOnServer: (id: string) => void = () => {};

function selectedOf(sites: readonly PantrySite[]): SelectedSite {
  const site = sites.find((candidate) => candidate.isSelected)!;
  return { id: site.id, name: site.name, siteCount: sites.length };
}

function Lista({ initial, mode = "visible" }: { initial: PantrySite[]; mode?: "visible" | "hidden" }) {
  const [sites, setSites] = useState(initial);
  useEffect(() => {
    selectOnServer = (id) => setSites((before) => before.map((site) => ({ ...site, isSelected: site.id === id })));
  }, []);
  return (
    <ToastProvider>
      <Activity mode={mode}>
        <h1>Inköpslista</h1>
        <ListSiteLine site={selectedOf(sites)} sites={sites} />
      </Activity>
    </ToastProvider>
  );
}

/** A promise resolved from the test, to see the sheet while the action waits. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const bytButton = () => screen.getByRole("button", { name: "Byt lager för listan" });
const sheet = () => screen.getByRole("dialog", { name: "Räkna listan mot" });
/** A place's row; while it is saved, its name is followed by "Sparar …". */
const radio = (name: string) => within(sheet()).getByRole("radio", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  refresh.mockReset();
  selectPantrySite.mockReset().mockImplementation(async ({ id }) => {
    const site = [hemma, stugan, torpet].find((candidate) => candidate.id === id)!;
    selectOnServer(id);
    return ok({ site: { id: site.id, name: site.name } });
  });
});

describe("ListSiteLine", () => {
  it("shows nothing with one place, or without a place", () => {
    const { rerender } = render(
      <ToastProvider>
        <ListSiteLine site={selectedOf([hemma])} sites={[hemma]} />
      </ToastProvider>,
    );
    expect(screen.queryByTestId("site-line")).toBeNull();
    expect(screen.queryByRole("button", { name: "Byt lager för listan" })).toBeNull();
    rerender(
      <ToastProvider>
        <ListSiteLine site={null} sites={[hemma, stugan]} />
      </ToastProvider>,
    );
    expect(screen.queryByTestId("site-line")).toBeNull();
    expect(screen.queryByRole("button", { name: "Byt lager för listan" })).toBeNull();
  });

  it("shows Lager with the place and the text button Byt, not in a live region", () => {
    render(<Lista initial={[hemma, stugan]} />);
    expect(screen.getByTestId("site-line")).toHaveTextContent("Lager: Hemma");
    expect(screen.getByTestId("site-line").closest("[aria-live]")).toBeNull();
    expect(bytButton()).toHaveTextContent(/^Byt$/);
    expect(bytButton()).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("opens Räkna listan mot with a radio per place in the order given, the selected one checked with a mark", async () => {
    const user = userEvent.setup();
    render(<Lista initial={[hemma, stugan, torpet]} />);
    await user.click(bytButton());
    const group = within(await screen.findByRole("dialog", { name: "Räkna listan mot" })).getByRole("radiogroup", {
      name: "Räkna listan mot",
    });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual(["Hemma", "Stugan", "Torpet"]);
    expect(radio("Hemma")).toHaveAttribute("aria-checked", "true");
    expect(radio("Hemma").querySelector("svg")).not.toBeNull();
    expect(radio("Stugan")).toHaveAttribute("aria-checked", "false");
    expect(radio("Stugan").querySelector("svg")).toBeNull();
    // Only the selected place is in the tab order; the arrow keys move between them.
    expect(radio("Hemma")).toHaveAttribute("tabindex", "0");
    expect(radio("Stugan")).toHaveAttribute("tabindex", "-1");
    radio("Hemma").focus();
    await user.keyboard("{ArrowDown}");
    expect(radio("Stugan")).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(radio("Torpet")).toHaveFocus();
    expect(selectPantrySite).not.toHaveBeenCalled();
  });

  it("selects Stugan, waits for the answer, then closes the sheet, confirms and shows Lager: Stugan", async () => {
    const user = userEvent.setup();
    const answer = deferred<Selected>();
    selectPantrySite.mockImplementation(() => answer.promise);
    render(<Lista initial={[hemma, stugan, torpet]} />);
    await user.click(bytButton());
    await user.click(radio("Stugan"));
    expect(selectPantrySite).toHaveBeenCalledWith({ id: stugan.id });
    // Saving: the row says so, the others wait, and the sheet stays.
    expect(radio("Stugan")).toHaveTextContent("Sparar …");
    expect(radio("Stugan")).toHaveAttribute("aria-disabled", "true");
    expect(radio("Hemma")).toBeDisabled();
    expect(radio("Torpet")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeDisabled();
    expect(screen.getByTestId("site-line")).toHaveTextContent("Lager: Hemma");

    await act(async () => {
      selectOnServer(stugan.id);
      answer.resolve(ok({ site: { id: stugan.id, name: "Stugan" } }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("site-line")).toHaveTextContent("Lager: Stugan");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Listan räknas nu mot Stugan.");
    // Focus goes back to Byt.
    await waitFor(() => expect(bytButton()).toHaveFocus());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("only closes the sheet on a tap on the selected place, saving nothing", async () => {
    const user = userEvent.setup();
    render(<Lista initial={[hemma, stugan]} />);
    await user.click(bytButton());
    await user.click(radio("Hemma"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(selectPantrySite).not.toHaveBeenCalled();
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("keeps the sheet open with a notice when the place cannot be saved, and reads the page again", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_failed"));
    render(<Lista initial={[hemma, stugan]} />);
    await user.click(bytButton());
    await user.click(radio("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att spara stället. Försök igen.");
    expect(radio("Hemma")).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(radio("Stugan")).toBeEnabled());
    expect(radio("Stugan")).toHaveTextContent(/^Stugan$/);
    expect(screen.getByTestId("site-line")).toHaveTextContent("Lager: Hemma");
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("says so when there is no answer at all", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockRejectedValue(new Error("offline"));
    render(<Lista initial={[hemma, stugan]} />);
    await user.click(bytButton());
    await user.click(radio("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att spara stället. Försök igen.");
    expect(refresh).toHaveBeenCalled();
  });

  it("says a place removed elsewhere is gone, and reads the sheet again", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_gone"));
    render(<Lista initial={[hemma, stugan]} />);
    await user.click(bytButton());
    await user.click(radio("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Stället finns inte längre. Välj ett annat ställe.");
    expect(refresh).toHaveBeenCalled();
  });

  it("reads the page again, without a notice, when the session has ended", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("unauthorized"));
    render(<Lista initial={[hemma, stugan]} />);
    await user.click(bytButton());
    await user.click(radio("Stugan"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(within(sheet()).queryByRole("alert")).toBeNull();
  });

  it("starts without the last notice when opened again", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValueOnce(fail("pantry_site_failed"));
    render(<Lista initial={[hemma, stugan]} />);
    await user.click(bytButton());
    await user.click(radio("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Avbryt" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(bytButton());
    expect(within(await screen.findByRole("dialog", { name: "Räkna listan mot" })).queryByRole("alert")).toBeNull();
  });

  it("closes the sheet when Inköpslista is hidden after a navigation", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Lista initial={[hemma, stugan]} />);
    await user.click(bytButton());
    expect(await screen.findByRole("dialog", { name: "Räkna listan mot" })).toBeInTheDocument();
    await act(async () => rerender(<Lista initial={[hemma, stugan]} mode="hidden" />));
    await act(async () => rerender(<Lista initial={[hemma, stugan]} mode="visible" />));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
