import { render, screen, waitFor, within } from "@testing-library/react";
import Link from "next/link";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newPerson, parsePeople, serializePeople } from "../domain/people";
import type { Person } from "../domain/profile";
import { ProfilesPages } from "../../../../tests/support/profiles-pages";
import { importedStorageKey, localOnlyNote, peopleStorageKey } from "./use-people";

// Profiles saved for the household: the page hands over what the household has, changes are shown at once and saved
// through server actions, a device's own old list moves up once, and when the household cannot be reached the phone
// keeps it for itself and says so.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("test-navigate", { detail: href }));
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => window.dispatchEvent(new CustomEvent("test-navigate", { detail: href })) }),
}));

const saveFoodProfile = vi.fn();
const removeFoodProfile = vi.fn();
const importLocalProfiles = vi.fn();
vi.mock("../actions/food-profile", () => ({
  saveFoodProfile: (...args: unknown[]) => saveFoodProfile(...args),
  removeFoodProfile: (...args: unknown[]) => removeFoodProfile(...args),
  importLocalProfiles: (...args: unknown[]) => importLocalProfiles(...args),
}));

const members = [
  { id: "u1", name: "Pontus", isMe: true },
  { id: "u2", name: "Anna", isMe: false },
];
const local = () => parsePeople(localStorage.getItem(peopleStorageKey));
const annaOnServer: Person = { ...newPerson("m-u2", "Medlem", "member"), drink: "vin", allergies: ["notter"] };

beforeEach(() => {
  localStorage.clear();
  saveFoodProfile.mockReset().mockResolvedValue({ ok: true, data: null });
  removeFoodProfile.mockReset().mockResolvedValue({ ok: true, data: null });
  importLocalProfiles.mockReset();
});

describe("ProfilesScreen with the household's profiles", () => {
  it("shows what the household saved, with the members' names, and no fallback line", async () => {
    render(<ProfilesPages members={members} profiles={[annaOnServer]} />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Du"), expect.stringContaining("Anna")]);
    expect(rows[1]).toHaveTextContent("Allergi: nötter");
    expect(rows[1]).toHaveTextContent("Vin");
    expect(screen.queryByTestId("menu-profiles-notice")).not.toBeInTheDocument();
  });

  it("saves a change through the action under the person's id, and not in localStorage", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[]} />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    await user.click(within(await screen.findByTestId("menu-profile")).getByRole("button", { name: /Kaffe/ }));
    expect(saveFoodProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveFoodProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "me", drink: "kaffe" })));
    expect((await screen.findAllByText("Sparat för dig.")).length).toBeGreaterThan(0);
    expect(local().some((person) => person.drink === "kaffe")).toBe(false);
    expect(screen.queryByTestId("menu-profiles-notice")).not.toBeInTheDocument();
  });

  it("adds a person without an account for the household and shows them under Utan konto", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[]} />);
    await user.click(await screen.findByTestId("menu-person-add"));
    await user.type(screen.getByTestId("menu-person-name"), "Maja");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(saveFoodProfile).toHaveBeenCalledWith(expect.objectContaining({ name: "Maja", kind: "member" })));
    expect(within(screen.getByRole("list", { name: "Utan konto" })).getByText("Maja")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Utan konto" })).toHaveTextContent("Inget ifyllt: äter allt");
  });

  it("removes a person without an account and goes back to the list", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[newPerson("p-g1", "Maja", "member")]} />);
    await user.click(await screen.findByText("Maja"));
    await user.click(screen.getByRole("button", { name: "Ta bort Maja" }));
    await user.click(screen.getByRole("button", { name: "Ta bort" }));
    await waitFor(() => expect(removeFoodProfile).toHaveBeenCalledWith("p-g1"));
    expect(await screen.findByTestId("menu-profiles")).toBeInTheDocument();
  });

  it("keeps the change on this device and says so when the household's list does not take it", async () => {
    saveFoodProfile.mockResolvedValue({ ok: false, error: { code: "food_profile_failed" } });
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[]} />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    await user.click(within(await screen.findByTestId("menu-profile")).getByRole("button", { name: /Vin/ }));
    await user.click(screen.getByRole("button", { name: "Spara" }));
    expect(await screen.findByTestId("menu-profiles-notice")).toHaveTextContent(localOnlyNote);
    expect(local().find((person) => person.id === "me")?.drink).toBe("vin");
    expect(localStorage.getItem(importedStorageKey)).toBeNull();
  });

  it("brings a person back with a message when removing them failed", async () => {
    removeFoodProfile.mockResolvedValue({ ok: false, error: { code: "food_profile_failed" } });
    const guest = newPerson("p-g1", "Bo", "guest");
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[guest]} />);
    await user.click(await screen.findByText("Bo"));
    await user.click(screen.getByRole("button", { name: "Ta bort Bo" }));
    await user.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(await screen.findByTestId("menu-profiles-notice")).toHaveTextContent("Det gick inte att spara för hushållet");
    expect(await screen.findByDisplayValue("Bo")).toBeInTheDocument();
  });

  it("uses this device's own list and says so when the household's list could not be read", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([{ ...newPerson("me", "Du", "member"), drink: "ol" }]));
    render(<ProfilesPages members={members} profiles={null} />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows[0]).toHaveTextContent("Öl");
    expect(screen.getByTestId("menu-profiles-notice")).toHaveTextContent(localOnlyNote);
    expect(importLocalProfiles).not.toHaveBeenCalled();
  });
});

describe("Spara and Ångra on a person's page", () => {
  const anna: Person = { ...annaOnServer, tastes: { fisk: 2 } };

  it("holds every change as a draft, says how many and for whom, and writes them in one save", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[anna]} />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[1]);
    expect(screen.getByTestId("menu-profile-name")).toHaveTextContent("Anna");
    expect(screen.queryByTestId("profile-draft-bar")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Protein/ }));
    screen.getByRole("slider", { name: "Kyckling" }).focus();
    await user.keyboard("{Home}");
    screen.getByRole("slider", { name: "Fisk" }).focus();
    await user.keyboard("{ArrowLeft}");
    await user.click(screen.getByRole("button", { name: /Kaffe/ }));
    expect(screen.getByTestId("profile-draft-count")).toHaveTextContent("3 osparade ändringar för Anna");
    expect(saveFoodProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(saveFoodProfile).toHaveBeenCalledTimes(1));
    expect(saveFoodProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "m-u2", drink: "kaffe", tastes: { fisk: 1, kyckling: -2 } }));
    expect((await screen.findAllByText("Sparat för Anna.")).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("profile-draft-bar")).not.toBeInTheDocument();
  });

  it("puts back what was saved with Ångra, the allergies too, and writes nothing", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[anna]} />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[1]);
    await user.click(screen.getByRole("button", { name: /Protein/ }));
    screen.getByRole("slider", { name: "Fisk" }).focus();
    await user.keyboard("{Home}");
    await user.click(screen.getByTestId("menu-allergies-open"));
    await user.click(within(await screen.findByTestId("menu-allergies")).getByRole("button", { name: /Gluten/ }));
    expect(screen.getByTestId("profile-draft-count")).toHaveTextContent("2 osparade ändringar för Anna");
    await user.click(screen.getByRole("button", { name: "Ångra" }));
    expect(screen.queryByTestId("profile-draft-bar")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("menu-allergies")).getByRole("button", { name: /Gluten/ })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Tillbaka" }));
    await user.click(screen.getByRole("button", { name: /Protein/ }));
    expect(screen.getByRole("slider", { name: "Fisk" })).toHaveAttribute("aria-valuetext", "Älskar");
    expect(saveFoodProfile).not.toHaveBeenCalled();
  });

  it("puts the name of a person without an account back with Ångra", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages members={members} profiles={[newPerson("p-g1", "Maja", "member")]} />);
    await user.click(await screen.findByText("Maja"));
    const field = screen.getByLabelText("Namn");
    await user.clear(field);
    await user.type(field, "Majken");
    expect(screen.getByTestId("menu-profile-name")).toHaveTextContent("Majken");
    expect(screen.getByTestId("profile-draft-count")).toHaveTextContent("1 osparad ändring för Majken");
    await user.click(screen.getByRole("button", { name: "Ångra" }));
    expect(screen.getByLabelText("Namn")).toHaveValue("Maja");
    expect(screen.getByTestId("menu-profile-name")).toHaveTextContent("Maja");
  });

  it("asks before a link leaves the page with changes, stays on Avbryt and leaves without saving on OK", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    // The mocked next/link dispatches test-navigate: only reached when the question lets it through.
    const followed = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <ProfilesPages members={members} profiles={[anna]} />
        <Link href="/recept">Recept</Link>
      </>,
    );
    await user.click((await screen.findAllByTestId("menu-profile-row"))[1]);
    await user.click(screen.getByRole("button", { name: /Vin/ }));
    window.addEventListener("test-navigate", followed);
    await user.click(screen.getByRole("link", { name: "Recept" }));
    expect(confirm).toHaveBeenLastCalledWith("Du har ändringar för Anna som inte är sparade. Lämna sidan utan att spara?");
    expect(screen.getByTestId("profile-draft-bar")).toBeInTheDocument();
    expect(followed).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole("link", { name: "Recept" }));
    expect(followed).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("profile-draft-bar")).not.toBeInTheDocument();
    expect(saveFoodProfile).not.toHaveBeenCalled();
    window.removeEventListener("test-navigate", followed);
    confirm.mockRestore();
  });

  it("does not ask without changes", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(
      <>
        <ProfilesPages members={members} profiles={[anna]} />
        <Link href="/recept">Recept</Link>
      </>,
    );
    await user.click((await screen.findAllByTestId("menu-profile-row"))[1]);
    await user.click(screen.getByRole("link", { name: "Recept" }));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("moving up what this device kept", () => {
  const mine = { ...newPerson("me", "Du", "member"), drink: "ol" as const, tastes: { pasta: 2 as const } };
  const guest = { ...newPerson("p-g1", "Bo", "guest"), allergies: ["gluten" as const] };

  it("imports once for the people the household has no row for, shows them, marks it done and keeps the local copy", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([mine, guest]));
    importLocalProfiles.mockResolvedValue({ ok: true, data: [annaOnServer, mine, guest] });
    render(<ProfilesPages members={members} profiles={[annaOnServer]} />);
    await waitFor(() => expect(importLocalProfiles).toHaveBeenCalledTimes(1));
    expect(importLocalProfiles.mock.calls[0][0].map((person: Person) => person.id)).toEqual(["me", "p-g1"]);
    expect(await screen.findByText("Bo")).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(importedStorageKey)).toBe("1"));
    expect(local()).toHaveLength(2);
  });

  it("does not offer a person the household already has", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([{ ...mine, drink: "kaffe" }, guest]));
    importLocalProfiles.mockResolvedValue({ ok: true, data: [mine, guest] });
    render(<ProfilesPages members={members} profiles={[mine]} />);
    await waitFor(() => expect(importLocalProfiles).toHaveBeenCalled());
    expect(importLocalProfiles.mock.calls[0][0].map((person: Person) => person.id)).toEqual(["p-g1"]);
  });

  it("is done at once with nothing to move, and not repeated once it has been done", async () => {
    render(<ProfilesPages members={members} profiles={[]} />);
    await waitFor(() => expect(localStorage.getItem(importedStorageKey)).toBe("1"));
    expect(importLocalProfiles).not.toHaveBeenCalled();
    localStorage.setItem(peopleStorageKey, serializePeople([guest]));
    render(<ProfilesPages members={members} profiles={[]} />);
    expect((await screen.findAllByTestId("menu-profiles")).length).toBeGreaterThan(0);
    expect(importLocalProfiles).not.toHaveBeenCalled();
  });

  it("tries again next time when the move failed, and leaves the local copy alone", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([guest]));
    importLocalProfiles.mockResolvedValue({ ok: false, error: { code: "food_profile_failed" } });
    render(<ProfilesPages members={members} profiles={[]} />);
    await waitFor(() => expect(importLocalProfiles).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(importedStorageKey)).toBeNull();
    expect(local()).toHaveLength(1);
  });
});
