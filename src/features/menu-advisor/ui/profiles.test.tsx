import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveOption } from "@/lib/options";
import { parsePeople } from "../domain/people";
import { ProfilesScreen } from "./profiles-screen";
import { peopleStorageKey } from "./use-people";

// Profiles under Tillval: off without the option; add a person, fill in taste, drink and allergies; all of it on this device.

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const saved = () => parsePeople(localStorage.getItem(peopleStorageKey));

beforeEach(() => {
  localStorage.clear();
  saveOption("menuAdvisor", true);
});

describe("ProfilesScreen", () => {
  it("says it is off when the option is off", async () => {
    localStorage.clear();
    render(<ProfilesScreen />);
    expect(await screen.findByText(/Menyrådgivaren är avstängd/)).toBeInTheDocument();
  });

  it("lists Du first, and survives broken storage", async () => {
    localStorage.setItem(peopleStorageKey, "{{{");
    render(<ProfilesScreen />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Du");
    expect(rows[0]).toHaveTextContent("Äter allt");
  });

  it("adds a person, saves taste and drink as you go, and registers allergies in a box of their own", async () => {
    const user = userEvent.setup();
    render(<ProfilesScreen />);
    await user.click(await screen.findByTestId("menu-person-add"));
    await user.type(screen.getByTestId("menu-person-name"), "Anna");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));

    const profile = await screen.findByTestId("menu-profile");
    // Allergies are only a row in the main view.
    expect(within(profile).getByTestId("menu-allergies-open")).toHaveTextContent("Inga angivna");
    expect(within(profile).queryByRole("button", { name: "Nötter" })).not.toBeInTheDocument();

    const fisk = within(profile).getAllByRole("radiogroup", { name: "Fisk" })[0];
    await user.click(within(fisk).getByRole("radio", { name: "Ogillar" }));
    await user.click(within(profile).getByRole("button", { name: /Vin/ }));
    expect(saved().find((person) => person.name === "Anna")).toMatchObject({ kind: "member", drink: "vin", tastes: { fisk: -1 } });

    await user.click(within(profile).getByTestId("menu-allergies-open"));
    const box = await screen.findByTestId("menu-allergies");
    await user.click(within(box).getByRole("button", { name: /Nötter/ }));
    expect(saved().find((person) => person.name === "Anna")?.allergies).toEqual(["notter"]);
    await user.click(within(box).getByRole("button", { name: "Tillbaka" }));
    expect(screen.getByTestId("menu-allergies-open")).toHaveTextContent("nötter");
  });

  it("clears a taste with the middle choice and removes a person after asking", async () => {
    const user = userEvent.setup();
    render(<ProfilesScreen />);
    await user.click(await screen.findByTestId("menu-person-add"));
    await user.type(screen.getByTestId("menu-person-name"), "Bo");
    await user.click(screen.getByRole("radio", { name: "Gäst" }));
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    const pasta = (await screen.findAllByRole("radiogroup", { name: "Pasta" }))[0];
    await user.click(within(pasta).getByRole("radio", { name: "Hatar" }));
    expect(saved().find((person) => person.name === "Bo")?.tastes).toEqual({ pasta: -2 });
    await user.click(within(pasta).getByRole("radio", { name: "Ingen åsikt" }));
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
    render(<ProfilesScreen members={members} />);
    const rows = await screen.findAllByTestId("menu-profile-row");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Du"), expect.stringContaining("Martina")]);
    await user.click(rows[1]);
    const profile = await screen.findByTestId("menu-profile");
    expect(within(profile).queryByRole("button", { name: /Ta bort/ })).not.toBeInTheDocument();
    expect(within(profile).queryByLabelText("Namn")).not.toBeInTheDocument();
    await user.click(within(profile).getByRole("button", { name: /Öl/ }));
    expect(saved().find((person) => person.id === "m-u2")).toMatchObject({ name: "Martina", drink: "ol" });
  });

  it("adds what is avoided and loved as chips, from the field and from suggestions, and saves it", async () => {
    const user = userEvent.setup();
    render(<ProfilesScreen />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    const avoid = await screen.findByTestId("menu-dislikes");
    const love = screen.getByTestId("menu-likes");
    expect(screen.getByText(/Allergier = får aldrig föreslås/)).toBeInTheDocument();

    await user.type(within(avoid).getByRole("textbox"), "  Koriander {Enter}");
    expect(saved()[0].dislikes).toEqual(["Koriander"]);
    expect(within(avoid).getByRole("button", { name: "Ta bort Koriander" })).toBeInTheDocument();
    // Added tags leave the suggestions; the other suggestions stay.
    expect(within(avoid).queryByRole("button", { name: "Lägg till koriander" })).not.toBeInTheDocument();
    await user.click(within(avoid).getByRole("button", { name: "Lägg till vitlök" }));
    expect(saved()[0].dislikes).toEqual(["Koriander", "vitlök"]);

    await user.type(within(love).getByRole("textbox"), "nasi goreng");
    await user.click(within(love).getByRole("button", { name: "Lägg till" }));
    expect(saved()[0].likes).toEqual(["nasi goreng"]);
    expect(within(love).queryByRole("button", { name: "Lägg till nasi goreng" })).not.toBeInTheDocument();

    await user.click(within(avoid).getByRole("button", { name: "Ta bort Koriander" }));
    expect(saved()[0].dislikes).toEqual(["vitlök"]);
    expect(within(avoid).getByRole("button", { name: "Lägg till koriander" })).toBeInTheDocument();
  });

  it("refuses a repeat and a tag that is too long, and says why", async () => {
    const user = userEvent.setup();
    render(<ProfilesScreen />);
    await user.click((await screen.findAllByTestId("menu-profile-row"))[0]);
    const avoid = await screen.findByTestId("menu-dislikes");
    const field = within(avoid).getByRole("textbox");
    await user.type(field, "lök{Enter}");
    await user.type(field, "LÖK{Enter}");
    expect(within(avoid).getByRole("alert")).toHaveTextContent("Det finns redan i listan.");
    await user.clear(field);
    await user.type(field, "a".repeat(45));
    await user.keyboard("{Enter}");
    expect(within(avoid).getByRole("alert")).toHaveTextContent("Max 40 tecken.");
    expect(saved()[0].dislikes).toEqual(["lök"]);
  });
});
