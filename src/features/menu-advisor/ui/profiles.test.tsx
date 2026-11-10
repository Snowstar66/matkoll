import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePeople } from "../domain/people";
import { ProfilesPages } from "../../../../tests/support/profiles-pages";
import { peopleStorageKey } from "./use-people";

// Smak och allergier (Medlemmar and the page of one person): there without any option; add a person, fill in taste, drink and allergies; all of it on this device.

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

const saved = () => parsePeople(localStorage.getItem(peopleStorageKey));

beforeEach(() => {
  localStorage.clear();
});

describe("ProfilesScreen", () => {
  it("is there without Menyrådgivare being on, and says nothing is filled in", async () => {
    render(<ProfilesPages />);
    expect(await screen.findByRole("heading", { name: "Smak och allergier" })).toBeInTheDocument();
    expect(screen.getByText("Utan konto")).toBeInTheDocument();
    expect(screen.getByTestId("menu-profile-summary")).toHaveTextContent("Inget ifyllt: äter allt");
  });

  it("lists Du first, and survives broken storage", async () => {
    localStorage.setItem(peopleStorageKey, "{{{");
    render(<ProfilesPages />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Du");
    expect(rows[0]).toHaveTextContent("Inget ifyllt: äter allt");
  });

  it("adds a person, saves taste and drink as you go, and registers allergies in a box of their own", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages />);
    await user.click(await screen.findByTestId("menu-person-add"));
    await user.type(screen.getByTestId("menu-person-name"), "Anna");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    await user.click(await screen.findByText("Anna"));

    const profile = await screen.findByTestId("menu-profile");
    // Allergies are only a row in the main view.
    expect(within(profile).getByTestId("menu-allergies-open")).toHaveTextContent("Inga angivna");
    expect(within(profile).queryByRole("button", { name: "Nötter" })).not.toBeInTheDocument();

    await user.click(within(profile).getByRole("button", { name: /Protein/ }));
    const fisk = within(profile).getByRole("slider", { name: "Fisk" });
    fisk.focus();
    await user.keyboard("{Home}");
    await user.click(within(profile).getByRole("button", { name: /Vin/ }));
    expect(saved().find((person) => person.name === "Anna")).toMatchObject({ kind: "member", drink: "vin", tastes: { fisk: -2 } });

    await user.click(within(profile).getByTestId("menu-allergies-open"));
    const box = await screen.findByTestId("menu-allergies");
    await user.click(within(box).getByRole("button", { name: /Nötter/ }));
    expect(saved().find((person) => person.name === "Anna")?.allergies).toEqual(["notter"]);
    await user.click(within(box).getByRole("button", { name: "Tillbaka" }));
    expect(screen.getByTestId("menu-allergies-open")).toHaveTextContent("nötter");
  });

  it("clears a taste with the middle choice and removes a person after asking", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages />);
    await user.click(await screen.findByTestId("menu-person-add"));
    await user.type(screen.getByTestId("menu-person-name"), "Bo");
    await user.click(screen.getByRole("radio", { name: "Gäst" }));
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    await user.click(await screen.findByText("Bo"));
    await user.click(await screen.findByRole("button", { name: /Maträtter/ }));
    const pasta = screen.getByRole("slider", { name: "Pasta" });
    pasta.focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(saved().find((person) => person.name === "Bo")?.tastes).toEqual({ pasta: -2 });
    await user.keyboard("{End}{Home}");
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(saved().find((person) => person.name === "Bo")?.tastes).toEqual({});

    await user.click(screen.getByRole("button", { name: "Ta bort Bo" }));
    await user.click(screen.getByRole("button", { name: "Ta bort" }));
    expect(saved().some((person) => person.name === "Bo")).toBe(false);
    expect(await screen.findByTestId("menu-profiles")).toBeInTheDocument();
  });

  it("brings the household's members along as people, saves what is filled in per member id, and cannot rename or remove them", async () => {
    const user = userEvent.setup();
    const members = [
      { id: "u1", name: "Pontus", isMe: true },
      { id: "u2", name: "Martina", isMe: false },
    ];
    render(<ProfilesPages members={members} />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Du"), expect.stringContaining("Martina")]);
    await user.click(rows[1]);
    const profile = await screen.findByTestId("menu-profile");
    expect(within(profile).queryByRole("button", { name: /Ta bort/ })).not.toBeInTheDocument();
    expect(within(profile).queryByLabelText("Namn")).not.toBeInTheDocument();
    await user.click(within(profile).getByRole("button", { name: /Öl/ }));
    expect(saved().find((person) => person.id === "m-u2")).toMatchObject({ name: "Martina", drink: "ol" });
  });

  it("adds an own thing with its own slider, saves it as a taste, and removes it again", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    const field = await screen.findByTestId("menu-taste-input");
    expect(screen.getByText(/Allergier = får aldrig föreslås/)).toBeInTheDocument();
    expect(screen.queryByTestId("menu-dislikes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("menu-likes")).not.toBeInTheDocument();

    await user.type(field, "  Nasi goreng {Enter}");
    const slider = screen.getByRole("slider", { name: "Nasi goreng" });
    // Okej until it is moved: nothing is stored yet.
    expect(saved()[0]?.tastes ?? {}).toEqual({});
    slider.focus();
    await user.keyboard("{End}");
    expect(saved()[0].tastes).toEqual({ "nasi goreng": 2 });
    expect(screen.getByTestId("taste-summary")).toHaveTextContent("Du älskar nasi goreng.");

    await user.click(screen.getByRole("button", { name: "Ta bort nasi goreng" }));
    expect(saved()[0].tastes).toEqual({});
    expect(screen.queryByRole("slider", { name: "Nasi goreng" })).not.toBeInTheDocument();
  });

  it("refuses a repeat, a markup text and a text that is too long, and says why", async () => {
    const user = userEvent.setup();
    render(<ProfilesPages />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    const field = await screen.findByTestId("menu-taste-input");
    await user.type(field, "lök{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Det finns redan i listan.");
    await user.clear(field);
    await user.type(field, "<b>x</b>{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Skriv bara ord");
    await user.clear(field);
    await user.type(field, "a".repeat(45));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Max 40 tecken.");
    expect(saved()[0]?.tastes ?? {}).toEqual({});
  });

  it("shows an older Undviker / Älskar list as sliders and saves it as tastes", async () => {
    localStorage.setItem(peopleStorageKey, JSON.stringify({ v: 1, people: [{ id: "me", name: "Du", kind: "member", dislikes: ["vitlök"], likes: ["nasi goreng"] }] }));
    const user = userEvent.setup();
    render(<ProfilesPages />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    expect(await screen.findByTestId("taste-summary")).toHaveTextContent("Du älskar nasi goreng. Undviker vitlök.");
    await user.click(screen.getByRole("button", { name: /Smaker och råvaror/ }));
    const garlic = screen.getByRole("slider", { name: "Vitlök" });
    expect(garlic).toHaveAttribute("aria-valuetext", "Ogillar");
    garlic.focus();
    await user.keyboard("{ArrowRight}");
    expect(saved()[0].tastes).toEqual({ vitlok: -1, "nasi goreng": 2 });
    expect(JSON.parse(localStorage.getItem(peopleStorageKey)!).people[0]).not.toHaveProperty("dislikes");
  });
});
