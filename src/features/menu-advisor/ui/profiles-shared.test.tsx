import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveOption } from "@/lib/options";
import { newPerson, parsePeople, serializePeople } from "../domain/people";
import type { Person } from "../domain/profile";
import { ProfilesScreen } from "./profiles-screen";
import { importedStorageKey, localOnlyNote, peopleStorageKey } from "./use-people";

// Profiles saved for the household: the page hands over what the household has, changes are shown at once and saved
// through server actions, a device's own old list moves up once, and when the household cannot be reached the phone
// keeps it for itself and says so.

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

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
  saveOption("menuAdvisor", true);
  saveFoodProfile.mockReset().mockResolvedValue({ ok: true, data: null });
  removeFoodProfile.mockReset().mockResolvedValue({ ok: true, data: null });
  importLocalProfiles.mockReset();
});

describe("ProfilesScreen with the household's profiles", () => {
  it("shows what the household saved, with the members' names, and no fallback line", async () => {
    render(<ProfilesScreen members={members} profiles={[annaOnServer]} />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Du"), expect.stringContaining("Anna")]);
    expect(rows[1]).toHaveTextContent("Allergi: nötter");
    expect(rows[1]).toHaveTextContent("Vin");
    expect(screen.queryByTestId("menu-profiles-notice")).not.toBeInTheDocument();
  });

  it("saves a change through the action under the person's id, and not in localStorage", async () => {
    const user = userEvent.setup();
    render(<ProfilesScreen members={members} profiles={[]} />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    await user.click(within(await screen.findByTestId("menu-profile")).getByRole("button", { name: /Kaffe/ }));
    await waitFor(() => expect(saveFoodProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "me", drink: "kaffe" })));
    expect(local().some((person) => person.drink === "kaffe")).toBe(false);
    expect(screen.queryByTestId("menu-profiles-notice")).not.toBeInTheDocument();
  });

  it("adds a person without an account for the household and removes them again", async () => {
    const user = userEvent.setup();
    render(<ProfilesScreen members={members} profiles={[]} />);
    await user.click(await screen.findByTestId("menu-person-add"));
    await user.type(screen.getByTestId("menu-person-name"), "Maja");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    await waitFor(() => expect(saveFoodProfile).toHaveBeenCalledWith(expect.objectContaining({ name: "Maja", kind: "member" })));
    await user.click(screen.getByRole("button", { name: "Ta bort Maja" }));
    await user.click(screen.getByRole("button", { name: "Ta bort" }));
    await waitFor(() => expect(removeFoodProfile).toHaveBeenCalledWith(expect.stringMatching(/^p-/)));
    expect(await screen.findByTestId("menu-profiles")).toBeInTheDocument();
    expect(screen.queryByText("Maja")).not.toBeInTheDocument();
  });

  it("keeps the change on this device and says so when the household's list does not take it", async () => {
    saveFoodProfile.mockResolvedValue({ ok: false, error: { code: "food_profile_failed" } });
    const user = userEvent.setup();
    render(<ProfilesScreen members={members} profiles={[]} />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    await user.click(within(await screen.findByTestId("menu-profile")).getByRole("button", { name: /Vin/ }));
    expect(await screen.findByTestId("menu-profiles-notice")).toHaveTextContent(localOnlyNote);
    expect(local().find((person) => person.id === "me")?.drink).toBe("vin");
    expect(localStorage.getItem(importedStorageKey)).toBeNull();
  });

  it("brings a person back with a message when removing them failed", async () => {
    removeFoodProfile.mockResolvedValue({ ok: false, error: { code: "food_profile_failed" } });
    const guest = newPerson("p-g1", "Bo", "guest");
    const user = userEvent.setup();
    render(<ProfilesScreen members={members} profiles={[guest]} />);
    await user.click(await screen.findByText("Bo"));
    await user.click(screen.getByRole("button", { name: "Ta bort Bo" }));
    await user.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(await screen.findByTestId("menu-profiles-notice")).toHaveTextContent("Det gick inte att spara för hushållet");
    expect(await screen.findByText("Bo")).toBeInTheDocument();
  });

  it("uses this device's own list and says so when the household's list could not be read", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([{ ...newPerson("me", "Du", "member"), drink: "ol" }]));
    render(<ProfilesScreen members={members} profiles={null} />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows[0]).toHaveTextContent("Öl");
    expect(screen.getByTestId("menu-profiles-notice")).toHaveTextContent(localOnlyNote);
    expect(importLocalProfiles).not.toHaveBeenCalled();
  });
});

describe("moving up what this device kept", () => {
  const mine = { ...newPerson("me", "Du", "member"), drink: "ol" as const, tastes: { pasta: 2 as const } };
  const guest = { ...newPerson("p-g1", "Bo", "guest"), allergies: ["gluten" as const] };

  it("imports once for the people the household has no row for, shows them, marks it done and keeps the local copy", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([mine, guest]));
    importLocalProfiles.mockResolvedValue({ ok: true, data: [annaOnServer, mine, guest] });
    render(<ProfilesScreen members={members} profiles={[annaOnServer]} />);
    await waitFor(() => expect(importLocalProfiles).toHaveBeenCalledTimes(1));
    expect(importLocalProfiles.mock.calls[0][0].map((person: Person) => person.id)).toEqual(["me", "p-g1"]);
    expect(await screen.findByText("Bo")).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(importedStorageKey)).toBe("1"));
    expect(local()).toHaveLength(2);
  });

  it("does not offer a person the household already has", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([{ ...mine, drink: "kaffe" }, guest]));
    importLocalProfiles.mockResolvedValue({ ok: true, data: [mine, guest] });
    render(<ProfilesScreen members={members} profiles={[mine]} />);
    await waitFor(() => expect(importLocalProfiles).toHaveBeenCalled());
    expect(importLocalProfiles.mock.calls[0][0].map((person: Person) => person.id)).toEqual(["p-g1"]);
  });

  it("is done at once with nothing to move, and not repeated once it has been done", async () => {
    render(<ProfilesScreen members={members} profiles={[]} />);
    await waitFor(() => expect(localStorage.getItem(importedStorageKey)).toBe("1"));
    expect(importLocalProfiles).not.toHaveBeenCalled();
    localStorage.setItem(peopleStorageKey, serializePeople([guest]));
    render(<ProfilesScreen members={members} profiles={[]} />);
    expect((await screen.findAllByTestId("menu-profiles")).length).toBeGreaterThan(0);
    expect(importLocalProfiles).not.toHaveBeenCalled();
  });

  it("tries again next time when the move failed, and leaves the local copy alone", async () => {
    localStorage.setItem(peopleStorageKey, serializePeople([guest]));
    importLocalProfiles.mockResolvedValue({ ok: false, error: { code: "food_profile_failed" } });
    render(<ProfilesScreen members={members} profiles={[]} />);
    await waitFor(() => expect(importLocalProfiles).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(importedStorageKey)).toBeNull();
    expect(local()).toHaveLength(1);
  });
});
