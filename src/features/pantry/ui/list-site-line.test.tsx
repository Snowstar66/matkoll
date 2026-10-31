import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { PantrySite, SelectedSite } from "../domain/site";
import { ListSiteLine, refreshWaitMs, selectTimeoutMs } from "./list-site-line";

// The line "Boende: Hemma" and "Byt" in Inköpslista, and the sheet Byt boende
// (Story 8.5), with selectPantrySite stubbed. The "server" is a list of
// places: a successful selection changes it and publishes it to the page, as
// the action's revalidation would, and router.refresh publishes it too.

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

/** The server's places. */
let server: PantrySite[] = [];
/** Shows the server's places on the page, as a new read (a new array). */
let publish: () => void = () => {};

function selectOnServer(id: string) {
  server = server.map((site) => ({ ...site, isSelected: site.id === id }));
}

function selectedOf(sites: readonly PantrySite[]): SelectedSite | null {
  const site = sites.find((candidate) => candidate.isSelected);
  return site ? { id: site.id, name: site.name, siteCount: sites.length } : null;
}

const onSwitching = vi.fn<(siteId: string | null) => void>();

function Lista({ mode = "visible", busy = false, listSite }: { mode?: "visible" | "hidden"; busy?: boolean; listSite?: SelectedSite | null }) {
  const [sites, setSites] = useState(server);
  useEffect(() => {
    publish = () => setSites([...server]);
  }, []);
  return (
    <ToastProvider>
      <Activity mode={mode}>
        <h1>Inköpslista</h1>
        <ListSiteLine
          site={listSite === undefined ? selectedOf(sites) : listSite}
          sites={sites}
          busy={busy}
          onSwitching={onSwitching}
        />
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

const bytButton = () => screen.getByRole("button", { name: "Byt boende för listan" });
const sheet = () => screen.getByRole("dialog", { name: "Räkna listan mot" });
/** A place's row; while it is saved, its name is followed by "Sparar …". */
const row = (name: string) => within(sheet()).getByRole("button", { name: new RegExp(`^${name}`) });
const toastText = () => screen.queryByTestId("toast")?.textContent ?? null;

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(bytButton());
  return screen.findByRole("dialog", { name: "Räkna listan mot" });
}

beforeEach(() => {
  server = [hemma, stugan];
  onSwitching.mockReset();
  refresh.mockReset().mockImplementation(() => publish());
  selectPantrySite.mockReset().mockImplementation(async ({ id }) => {
    const site = server.find((candidate) => candidate.id === id)!;
    selectOnServer(id);
    publish();
    return ok({ site: { id: site.id, name: site.name } });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ListSiteLine", () => {
  it("shows nothing with one place", () => {
    server = [hemma];
    render(<Lista />);
    expect(screen.queryByTestId("site-line")).toBeNull();
    expect(screen.queryByRole("button", { name: "Byt boende för listan" })).toBeNull();
  });

  it("shows Boende with the place and the text button Byt, not in a live region", () => {
    render(<Lista />);
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Hemma");
    expect(screen.getByTestId("site-line").closest("[aria-live]")).toBeNull();
    expect(bytButton()).toHaveTextContent(/^Byt$/);
    expect(bytButton()).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("shows the place selected among the places when the list has none, so a failing place can be left", () => {
    server = [{ ...hemma, isSelected: false }, { ...stugan, isSelected: true }];
    render(<Lista listSite={null} />);
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Stugan");
  });

  it("reads the page again, once, when the list and the places disagree", () => {
    render(<Lista listSite={{ id: stugan.id, name: "Stugan", siteCount: 2 }} />);
    // The line names the place the list was counted against.
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Stugan");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lets Byt wait while the list saves something", () => {
    const { rerender } = render(<Lista busy />);
    expect(bytButton()).toBeDisabled();
    rerender(<Lista />);
    expect(bytButton()).toBeEnabled();
  });

  it("lists the places as plain buttons in the order given, the selected one current with a mark", async () => {
    const user = userEvent.setup();
    server = [hemma, stugan, torpet];
    render(<Lista />);
    const dialog = await openSheet(user);
    const list = within(dialog).getByRole("list", { name: "Räkna listan mot" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Hemma", "Stugan", "Torpet"]);
    expect(within(dialog).queryByRole("radiogroup")).toBeNull();
    expect(row("Hemma")).toHaveAttribute("aria-current", "true");
    expect(row("Hemma").querySelector("svg")).not.toBeNull();
    expect(row("Stugan")).not.toHaveAttribute("aria-current");
    expect(row("Stugan").querySelector("svg")).toBeNull();
    // The normal tab order, every row in it.
    for (const button of buttons) expect(button).not.toHaveAttribute("tabindex");
  });

  it("selects Stugan, waits for the answer, then closes the sheet, confirms and shows Boende: Stugan", async () => {
    const user = userEvent.setup();
    const answer = deferred<Selected>();
    selectPantrySite.mockImplementation(() => answer.promise);
    server = [hemma, stugan, torpet];
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    expect(selectPantrySite).toHaveBeenCalledWith({ id: stugan.id });
    expect(onSwitching).toHaveBeenLastCalledWith(stugan.id);
    // Saving: the row says so, every row waits, and the sheet stays.
    expect(row("Stugan")).toHaveTextContent("Sparar …");
    expect(row("Stugan")).toBeDisabled();
    expect(row("Hemma")).toBeDisabled();
    expect(row("Torpet")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeDisabled();
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Hemma");

    await act(async () => {
      selectOnServer(stugan.id);
      publish();
      answer.resolve(ok({ site: { id: stugan.id, name: "Stugan" } }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Stugan");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Listan räknas nu mot Stugan.");
    await waitFor(() => expect(bytButton()).toHaveFocus());
    expect(refresh).not.toHaveBeenCalled();
    expect(onSwitching).not.toHaveBeenCalledWith(null);
  });

  it("saves a tap on the place shown as selected too, since the page may be stale", async () => {
    const user = userEvent.setup();
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Hemma"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(selectPantrySite).toHaveBeenCalledWith({ id: hemma.id });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Listan räknas nu mot Hemma.");
    // Nothing for the list to keep quiet about.
    expect(onSwitching).toHaveBeenLastCalledWith(null);
  });

  it("saves once when the row is tapped twice, or Enter is pressed, while it is saved", async () => {
    const answer = deferred<Selected>();
    selectPantrySite.mockImplementation(() => answer.promise);
    const user = userEvent.setup();
    render(<Lista />);
    await openSheet(user);
    const stuganRow = row("Stugan");
    fireEvent.click(stuganRow);
    fireEvent.click(stuganRow);
    fireEvent.keyDown(stuganRow, { key: "Enter" });
    fireEvent.click(row("Hemma"));
    expect(selectPantrySite).toHaveBeenCalledTimes(1);
    await act(async () => answer.resolve(ok({ site: { id: stugan.id, name: "Stugan" } })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(selectPantrySite).toHaveBeenCalledTimes(1);
  });

  it("keeps the sheet open with a notice when the place cannot be saved, reads the page again and focuses the row", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_failed"));
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
    expect(row("Hemma")).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(row("Stugan")).toBeEnabled());
    expect(row("Stugan")).toHaveTextContent(/^Stugan$/);
    await waitFor(() => expect(row("Stugan")).toHaveFocus());
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Hemma");
    expect(toastText()).toBeNull();
    expect(refresh).toHaveBeenCalled();
    expect(onSwitching).toHaveBeenLastCalledWith(null);
  });

  it("counts a lost answer as saved when the page, read again, shows the place tapped", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockImplementation(async ({ id }) => {
      // Saved on the server, but the answer never arrives.
      selectOnServer(id);
      throw new Error("offline");
    });
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Stugan");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Listan räknas nu mot Stugan.");
  });

  it("says a lost answer failed when the page, read again, still shows the old place", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockRejectedValue(new Error("offline"));
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Hemma");
    expect(onSwitching).toHaveBeenLastCalledWith(null);
  });

  it("gives up on a selection without an answer, and on a page that is not read again, so the sheet is never locked", async () => {
    vi.useFakeTimers();
    selectPantrySite.mockImplementation(() => new Promise<Selected>(() => {}));
    // The page is not read again either (the hanging action holds the router).
    refresh.mockImplementation(() => {});
    render(<Lista />);
    fireEvent.click(bytButton());
    expect(sheet()).toBeInTheDocument();
    fireEvent.click(row("Stugan"));
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(selectTimeoutMs));
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(refreshWaitMs));
    expect(within(sheet()).getByRole("alert")).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
    expect(screen.getByRole("button", { name: "Avbryt" })).toBeEnabled();
    expect(row("Stugan")).toBeEnabled();
  });

  it("says a place removed elsewhere is gone, and the sheet, read again, no longer has it", async () => {
    const user = userEvent.setup();
    server = [hemma, stugan, torpet];
    selectPantrySite.mockImplementation(async () => {
      server = server.filter((site) => site.id !== stugan.id);
      return fail("pantry_site_gone");
    });
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Boendet finns inte längre. Välj ett annat boende.");
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(within(sheet()).queryByRole("button", { name: /^Stugan/ })).toBeNull());
    expect(row("Torpet")).toBeEnabled();
  });

  it("says a place is gone in a toast when it was the last but one, and focuses the heading", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockImplementation(async () => {
      server = server.filter((site) => site.id !== stugan.id);
      return fail("pantry_site_gone");
    });
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    await waitFor(() => expect(screen.queryByTestId("site-line")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByTestId("toast")).toHaveTextContent("Boendet finns inte längre. Välj ett annat boende.");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("never opens the sheet again by itself, nor with an old notice, when the line goes and comes back", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("pantry_site_failed"));
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toBeInTheDocument();
    // Stugan removed elsewhere: the line goes with the sheet.
    await act(async () => {
      server = [hemma];
      publish();
    });
    expect(screen.queryByTestId("site-line")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
    // Stugan back: the line, but no sheet.
    await act(async () => {
      server = [hemma, stugan];
      publish();
    });
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Hemma");
    expect(screen.queryByRole("dialog")).toBeNull();
    await openSheet(user);
    expect(within(sheet()).queryByRole("alert")).toBeNull();
  });

  it("closes the sheet before the page is read again when the session has ended", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValue(fail("unauthorized"));
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts without the last notice when opened again", async () => {
    const user = userEvent.setup();
    selectPantrySite.mockResolvedValueOnce(fail("pantry_site_failed"));
    render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    expect(await within(sheet()).findByRole("alert")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Avbryt" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Avbryt" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const dialog = await openSheet(user);
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("closes the sheet when Inköpslista is hidden after a navigation", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Lista />);
    await openSheet(user);
    await act(async () => rerender(<Lista mode="hidden" />));
    await act(async () => rerender(<Lista mode="visible" />));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reports a failure as a toast when Inköpslista was hidden while it was saved", async () => {
    const user = userEvent.setup();
    const answer = deferred<Selected>();
    selectPantrySite.mockImplementation(() => answer.promise);
    const { rerender } = render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    await act(async () => rerender(<Lista mode="hidden" />));
    await act(async () => answer.resolve(fail("pantry_site_failed")));
    await waitFor(() => expect(toastText()).toBe("Det gick inte att spara boendet. Försök igen."));
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Det gick inte att spara boendet. Försök igen.");
  });

  it("confirms nothing when Inköpslista was hidden while it was saved", async () => {
    const user = userEvent.setup();
    const answer = deferred<Selected>();
    selectPantrySite.mockImplementation(() => answer.promise);
    const { rerender } = render(<Lista />);
    await openSheet(user);
    await user.click(row("Stugan"));
    await act(async () => rerender(<Lista mode="hidden" />));
    await act(async () => {
      selectOnServer(stugan.id);
      publish();
      answer.resolve(ok({ site: { id: stugan.id, name: "Stugan" } }));
    });
    await act(async () => rerender(<Lista mode="visible" />));
    expect(screen.getByTestId("site-line")).toHaveTextContent("Boende: Stugan");
    expect(toastText()).toBeNull();
  });
});
