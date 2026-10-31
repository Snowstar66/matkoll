import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { SavePantrySiteState } from "../actions/save-pantry-site";
import type { PantrySiteWithCount } from "../domain/site";
import { SitesSheet } from "./sites-sheet";
import { SiteSwitchProvider, useLiveUndo } from "./site-switching";

// Arket Boenden (Story 8.2) with savePantrySite and deletePantrySite stubbed.
// By default the "server" applies a save or a delete to the places it gives
// the sheet, as a revalidation would.

const savePantrySite = vi.fn<(previous: SavePantrySiteState, formData: FormData) => Promise<SavePantrySiteState>>();
vi.mock("../actions/save-pantry-site", () => ({
  savePantrySite: (previous: SavePantrySiteState, formData: FormData) => savePantrySite(previous, formData),
}));
const deletePantrySite = vi.fn<(input: { id: string }) => Promise<Result<{ removed: boolean }>>>();
vi.mock("../actions/delete-pantry-site", () => ({
  deletePantrySite: (input: { id: string }) => deletePantrySite(input),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const hemma: PantrySiteWithCount = { id: "11111111-1111-4111-8111-111111111111", name: "Hemma", isSelected: true, itemCount: 12 };
const stugan: PantrySiteWithCount = { id: "22222222-2222-4222-8222-222222222222", name: "Stugan", isSelected: false, itemCount: 0 };
const torpet: PantrySiteWithCount = { id: "33333333-3333-4333-8333-333333333333", name: "Torpet", isSelected: false, itemCount: 3 };

let serverSites: PantrySiteWithCount[] = [];
let setServerSites: (sites: PantrySiteWithCount[]) => void = () => {};

function Sheet({ initial }: { initial: PantrySiteWithCount[] }) {
  const [sites, setSites] = useState(initial);
  const [state, setState] = useState({ open: true, session: 1 });
  useEffect(() => {
    serverSites = sites;
    setServerSites = setSites;
  }, [sites]);
  return (
    <>
      <button onClick={() => setState((current) => ({ open: true, session: current.session + 1 }))}>Öppna</button>
      <SitesSheet
        open={state.open}
        session={state.session}
        sites={sites}
        onClose={() => setState((current) => ({ ...current, open: false }))}
      />
    </>
  );
}

const sheet = () => screen.getByRole("dialog", { name: "Boenden" });
const rows = () => within(sheet()).getAllByTestId("site-row");
const status = () => within(sheet()).getByTestId("sites-status");
const newField = () => within(sheet()).getByLabelText("Nytt boende");
const addButton = () => within(sheet()).getByRole("button", { name: /^(Lägg till|Lägger till …)$/ });

function fields(formData: FormData) {
  return { id: String(formData.get("id")), name: String(formData.get("name")), mode: String(formData.get("mode")) };
}

beforeEach(() => {
  refresh.mockReset();
  savePantrySite.mockReset().mockImplementation(async (_previous, formData) => {
    const { id, name, mode } = fields(formData);
    const trimmed = name.trim();
    const site = { id, name: trimmed, isSelected: false };
    act(() =>
      setServerSites(
        mode === "add"
          ? [...serverSites, { ...site, itemCount: 0 }]
          : serverSites.map((other) => (other.id === id ? { ...other, name: trimmed } : other)),
      ),
    );
    return ok({ site, mode: mode as "add" | "rename" });
  });
  deletePantrySite.mockReset().mockImplementation(async ({ id }) => {
    act(() => setServerSites(serverSites.filter((other) => other.id !== id)));
    return ok({ removed: true });
  });
});

describe("SitesSheet", () => {
  it("keeps its live region in the page, also with nothing to say", () => {
    render(<Sheet initial={[hemma]} />);
    expect(status()).toBeVisible();
    expect(status()).toHaveAttribute("role", "status");
  });

  it("lists the places in order with their counts, Valt for the selected one, and Ta bort only where it can go", () => {
    render(<Sheet initial={[hemma, stugan, torpet]} />);
    expect(rows().map((row) => row.textContent)).toEqual(["Hemma12 varorValt", "Stugan0 varorTa bort", "Torpet3 varor"]);
    expect(within(sheet()).getByRole("button", { name: "Byt namn på Hemma" })).toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "Ta bort Stugan" })).toBeInTheDocument();
    expect(within(sheet()).queryByRole("button", { name: "Ta bort Hemma" })).toBeNull();
    expect(within(sheet()).queryByRole("button", { name: "Ta bort Torpet" })).toBeNull();
    expect(newField()).toHaveAttribute("placeholder", "Till exempel Stugan");
  });

  it("adds a place with an id chosen when the sheet opened, empties the field and confirms", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma]} />);
    expect(within(sheet()).queryByRole("button", { name: "Ta bort Hemma" })).toBeNull();
    await user.type(newField(), "Stugan");
    await user.click(addButton());

    await waitFor(() => expect(status()).toHaveTextContent("Lade till Stugan. Välj det för att se och fylla dess matvaror."));
    expect(newField()).toHaveValue("");
    const sent = fields(savePantrySite.mock.calls[0]![1]);
    expect(sent).toMatchObject({ name: "Stugan", mode: "add" });
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows().map((row) => row.textContent)).toEqual(["Hemma12 varorValt", "Stugan0 varorTa bort"]);

    // The next place gets a new id.
    await user.type(newField(), "Torpet");
    await user.click(addButton());
    await waitFor(() => expect(savePantrySite).toHaveBeenCalledTimes(2));
    expect(fields(savePantrySite.mock.calls[1]![1]).id).not.toBe(sent.id);
  });

  it("after a lost answer, reads the places again and keeps the id, also when the name changes, until they show", async () => {
    const user = userEvent.setup();
    savePantrySite.mockRejectedValueOnce(new Error("offline"));
    render(<Sheet initial={[hemma]} />);
    await user.type(newField(), "Stugan");
    await user.click(addButton());
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_site_failed);
    expect(refresh).toHaveBeenCalled();
    expect(newField()).toHaveValue("Stugan");
    const first = fields(savePantrySite.mock.calls[0]![1]).id;

    // A changed name keeps the id while the outcome is unknown: a retry can never add two places.
    await user.type(newField(), "x");
    await user.click(addButton());
    await waitFor(() => expect(savePantrySite).toHaveBeenCalledTimes(2));
    expect(fields(savePantrySite.mock.calls[1]![1]).id).toBe(first);
  });

  it("starts afresh, saying it was added, when the places read again have the place of a lost answer", async () => {
    const user = userEvent.setup();
    savePantrySite.mockImplementationOnce(async (_previous, formData) => {
      const { id } = fields(formData);
      // Added on the server, but the answer never came.
      queueMicrotask(() => setServerSites([...serverSites, { ...stugan, id }]));
      throw new Error("offline");
    });
    render(<Sheet initial={[hemma]} />);
    await user.type(newField(), "Stugan");
    await user.click(addButton());
    await waitFor(() => expect(status()).toHaveTextContent("Lade till Stugan. Välj det för att se och fylla dess matvaror."));
    expect(newField()).toHaveValue("");
    expect(newField()).toHaveFocus();
  });

  it("keeps the id when the places read again lack it, and a changed name then gets a new one", async () => {
    const user = userEvent.setup();
    savePantrySite.mockRejectedValueOnce(new Error("offline"));
    render(<Sheet initial={[hemma]} />);
    await user.type(newField(), "Stugan");
    await user.click(addButton());
    await within(sheet()).findByRole("alert");
    const first = fields(savePantrySite.mock.calls[0]![1]).id;
    act(() => setServerSites([...serverSites]));
    await user.click(addButton());
    await waitFor(() => expect(savePantrySite).toHaveBeenCalledTimes(2));
    expect(fields(savePantrySite.mock.calls[1]![1]).id).toBe(first);
    await user.type(newField(), "x");
    await user.click(addButton());
    await waitFor(() => expect(savePantrySite).toHaveBeenCalledTimes(3));
    expect(fields(savePantrySite.mock.calls[2]![1]).id).not.toBe(first);
  });

  it("never says Lade till for a retry whose place was renamed since", async () => {
    const user = userEvent.setup();
    savePantrySite.mockImplementationOnce(async (_previous, formData) => {
      const { id } = fields(formData);
      act(() => setServerSites([...serverSites, { ...stugan, id, name: "Vinterstugan" }]));
      return fail("pantry_site_failed");
    });
    render(<Sheet initial={[hemma]} />);
    await user.type(newField(), "Stugan");
    await user.click(addButton());
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_site_failed);
    await waitFor(() => expect(newField()).toHaveValue(""));
    expect(status()).toHaveTextContent("");
  });

  it("focuses Nytt boende after a place was added", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma]} />);
    await user.type(newField(), "Stugan");
    await user.click(addButton());
    await waitFor(() => expect(newField()).toHaveFocus());
  });

  it("refuses a name that only looks empty", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma]} />);
    await user.type(newField(), "\u3164\u00ad");
    await user.click(addButton());
    expect(within(sheet()).getByText("Ange ett namn på boendet.")).toBeInTheDocument();
    expect(savePantrySite).not.toHaveBeenCalled();
  });

  it.each([
    ["", "Ange ett namn på boendet."],
    ["   ", "Ange ett namn på boendet."],
    ["a".repeat(41), "Namnet får vara högst 40 tecken."],
  ])("refuses %j under the field, without saving", async (name, message) => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma]} />);
    if (name) await user.type(newField(), name);
    await user.click(addButton());
    expect(within(sheet()).getByText(message)).toBeInTheDocument();
    expect(newField()).toHaveFocus();
    expect(savePantrySite).not.toHaveBeenCalled();
  });

  it("shows the server's message for a taken name under the field", async () => {
    const user = userEvent.setup();
    savePantrySite.mockResolvedValue(
      fail("pantry_site_name_taken", { name: "Det finns redan ett boende som heter stugan." }),
    );
    render(<Sheet initial={[hemma, stugan]} />);
    await user.type(newField(), "stugan");
    await user.click(addButton());
    expect(await within(sheet()).findByText("Det finns redan ett boende som heter stugan.")).toBeInTheDocument();
    expect(newField()).toHaveAttribute("aria-invalid", "true");
    expect(newField()).toHaveValue("stugan");
  });

  it("makes the field and Lägg till unavailable at 10 places, and says why before the field", () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({
      ...stugan,
      id: `${String(index).padStart(8, "0")}-2222-4222-8222-222222222222`,
      name: `Boende ${index + 1}`,
      isSelected: index === 0,
    }));
    render(<Sheet initial={ten} />);
    expect(newField()).toBeDisabled();
    expect(addButton()).toBeDisabled();
    const reason = within(sheet()).getByText("Du kan ha högst 10 boenden.");
    expect(reason.compareDocumentPosition(newField()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newField()).toHaveAttribute("aria-describedby", reason.id);
  });

  it("renames a place from its row, one at a time, and confirms", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(within(sheet()).getByRole("button", { name: "Byt namn på Stugan" }));
    const field = within(sheet()).getByLabelText("Namn");
    expect(field).toHaveValue("Stugan");
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, "Vinterstugan");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));

    await waitFor(() => expect(status()).toHaveTextContent("Boendet heter nu Vinterstugan."));
    expect(fields(savePantrySite.mock.calls[0]![1])).toEqual({ id: stugan.id, name: "Vinterstugan", mode: "rename" });
    expect(within(sheet()).queryByLabelText("Namn")).toBeNull();
    expect(within(sheet()).getByRole("button", { name: "Byt namn på Vinterstugan" })).toBeInTheDocument();
  });

  it("leaves the name with Avbryt, and saves nothing for an unchanged name", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(within(sheet()).getByRole("button", { name: "Byt namn på Stugan" }));
    await user.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet()).queryByLabelText("Namn")).toBeNull();
    await user.click(within(sheet()).getByRole("button", { name: "Byt namn på Hemma" }));
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(within(sheet()).queryByLabelText("Namn")).toBeNull();
    expect(savePantrySite).not.toHaveBeenCalled();
  });

  it("says the place is gone when it went away before the new name was saved", async () => {
    const user = userEvent.setup();
    savePantrySite.mockResolvedValue(fail("pantry_site_gone"));
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(within(sheet()).getByRole("button", { name: "Byt namn på Stugan" }));
    await user.type(within(sheet()).getByLabelText("Namn"), "x");
    await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent("Boendet finns inte längre. Välj ett annat boende.");
    expect(within(sheet()).queryByLabelText("Namn")).toBeNull();
  });

  it("removes an empty place at once, without asking, and confirms", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort Stugan" }));
    await waitFor(() => expect(status()).toHaveTextContent("Tog bort Stugan."));
    expect(deletePantrySite).toHaveBeenCalledWith({ id: stugan.id });
    expect(rows()).toHaveLength(1);
    expect(within(sheet()).queryByText("Släng ändringarna?")).toBeNull();
  });

  it("says why a place could not be removed when another tab changed it", async () => {
    const user = userEvent.setup();
    deletePantrySite.mockResolvedValue(fail("pantry_site_in_use"));
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(within(sheet()).getByRole("button", { name: "Ta bort Stugan" }));
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(
      "Boendet har varor eller är valt och kan inte tas bort.",
    );
  });

  it("starts afresh each time it opens", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma, stugan]} />);
    await user.type(newField(), "Torp");
    await user.click(within(sheet()).getByRole("button", { name: "Byt namn på Stugan" }));
    await user.click(within(sheet()).getByRole("button", { name: "Klar" }));
    await user.click(screen.getByRole("button", { name: "Öppna" }));
    expect(newField()).toHaveValue("");
    expect(within(sheet()).queryByLabelText("Namn")).toBeNull();
  });
});

describe("SitesSheet, names on the rows", () => {
  const nameButton = (name: string) => within(sheet()).getByRole("button", { name: `Byt namn på ${name}` });
  const nameField = () => within(sheet()).getByLabelText("Namn");
  const saveButton = () => within(sheet()).getByRole("button", { name: /^(Spara|Sparar …)$/ });

  it("gives focus back to the row's name after a new name is saved, and after Avbryt", async () => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(nameButton("Stugan"));
    await user.click(within(sheet()).getByRole("button", { name: "Avbryt" }));
    await waitFor(() => expect(nameButton("Stugan")).toHaveFocus());

    await user.click(nameButton("Stugan"));
    await user.clear(nameField());
    await user.type(nameField(), "Vinterstugan");
    await user.click(saveButton());
    await waitFor(() => expect(nameButton("Vinterstugan")).toHaveFocus());
  });

  it.each([
    ["", "Ange ett namn på boendet."],
    ["a".repeat(41), "Namnet får vara högst 40 tecken."],
  ])("shows %j's message under the field, with focus there, and saves nothing", async (name, message) => {
    const user = userEvent.setup();
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(nameButton("Stugan"));
    await user.clear(nameField());
    if (name) await user.type(nameField(), name);
    await user.click(saveButton());
    expect(within(sheet()).getByText(message)).toBeInTheDocument();
    expect(nameField()).toHaveAttribute("aria-invalid", "true");
    expect(nameField()).toHaveFocus();
    expect(savePantrySite).not.toHaveBeenCalled();
  });

  it("shows the server's message for a taken name under the field, with focus there", async () => {
    const user = userEvent.setup();
    savePantrySite.mockResolvedValue(fail("pantry_site_name_taken", { name: "Det finns redan ett boende som heter Hemma." }));
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(nameButton("Stugan"));
    await user.clear(nameField());
    await user.type(nameField(), "hemma");
    await user.click(saveButton());
    expect(await within(sheet()).findByText("Det finns redan ett boende som heter Hemma.")).toBeInTheDocument();
    expect(nameField()).toHaveAttribute("aria-invalid", "true");
    expect(nameField()).toHaveFocus();
  });

  it("keeps the field focused and read-only while the name is saved", async () => {
    const user = userEvent.setup();
    let answer: (state: SavePantrySiteState) => void = () => {};
    savePantrySite.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(nameButton("Stugan"));
    await user.type(nameField(), "x");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(nameField()).toHaveAttribute("readonly"));
    expect(nameField()).toHaveFocus();
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    await user.click(saveButton());
    expect(savePantrySite).toHaveBeenCalledTimes(1);
    await act(async () => answer(ok({ site: { ...stugan, name: "Stuganx" }, mode: "rename" })));
  });

  it("reads the places again after a lost answer, and keeps the field", async () => {
    const user = userEvent.setup();
    savePantrySite.mockRejectedValue(new Error("offline"));
    render(<Sheet initial={[hemma, stugan]} />);
    await user.click(nameButton("Stugan"));
    await user.type(nameField(), "x");
    await user.click(saveButton());
    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(errorMessages.pantry_site_failed);
    expect(refresh).toHaveBeenCalled();
    expect(nameField()).toHaveValue("Stuganx");
  });

  it("follows a rename made on another device while the field is untouched", () => {
    render(<Sheet initial={[hemma, stugan]} />);
    fireEvent.click(nameButton("Stugan"));
    act(() => setServerSites([hemma, { ...stugan, name: "Vinterstugan" }]));
    expect(nameField()).toHaveValue("Vinterstugan");
  });
});

describe("SitesSheet, an expired session", () => {
  it.each(["add", "rename", "remove"] as const)("reads the page again for %s, without a notice", async (what) => {
    const user = userEvent.setup();
    savePantrySite.mockResolvedValue(fail("unauthorized"));
    deletePantrySite.mockResolvedValue(fail("unauthorized"));
    render(<Sheet initial={[hemma, stugan]} />);
    if (what === "add") {
      await user.type(newField(), "Torpet");
      await user.click(addButton());
    } else if (what === "rename") {
      await user.click(within(sheet()).getByRole("button", { name: "Byt namn på Stugan" }));
      await user.type(within(sheet()).getByLabelText("Namn"), "x");
      await user.click(within(sheet()).getByRole("button", { name: "Spara" }));
    } else {
      await user.click(within(sheet()).getByRole("button", { name: "Ta bort Stugan" }));
    }
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(within(sheet()).queryByRole("alert")).toBeNull();
  });
});

describe("SitesSheet, Ta bort", () => {
  it("shows no counts and no Ta bort when the counts could not be read", () => {
    render(<Sheet initial={[{ ...hemma, itemCount: null }, { ...stugan, itemCount: null }]} />);
    expect(rows().map((row) => row.textContent)).toEqual(["HemmaValt", "Stugan"]);
    expect(within(sheet()).queryByRole("button", { name: /^Ta bort/ })).toBeNull();
  });

  it("waits while a confirmation with Ångra for the place's rows shows", () => {
    let release: () => void = () => {};
    function Hold() {
      const { holdUndo } = useLiveUndo();
      useEffect(() => {
        release = holdUndo([stugan.id]);
      }, [holdUndo]);
      return null;
    }
    render(
      <SiteSwitchProvider>
        <Hold />
        <Sheet initial={[hemma, stugan]} />
      </SiteSwitchProvider>,
    );
    expect(within(sheet()).getByRole("button", { name: "Ta bort Stugan" })).toBeDisabled();
    act(() => release());
    expect(within(sheet()).getByRole("button", { name: "Ta bort Stugan" })).toBeEnabled();
  });
});
