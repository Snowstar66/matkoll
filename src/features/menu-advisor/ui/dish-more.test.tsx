import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { MenuDish } from "../domain/types";
import { DishBlurb, forgetExplanations, MoreAboutDish, swedishName } from "./dish-more";

vi.mock("../actions/explain-dish", () => ({ explainDish: vi.fn() }));

const dish = (patch: Partial<MenuDish> = {}): MenuDish => ({
  originalnamn: "Carpaccio de presa ibérica con virutas de foie",
  svenskt_namn: "Carpaccio av iberisk presa med spån av foie gras",
  grupp: "Förrätt",
  forklaring: "Tunt skivad svinnacke från ibericogris med flagor av foie gras och olivolja.",
  huvudingredienser: ["svinnacke", "foie gras"],
  kategori: "kott",
  allergener: [],
  kan_innehalla: [],
  pris: 18,
  valuta: "EUR",
  ...patch,
});

const menu = { restaurang: "Taverna Mock", sprak: "es" as const };
const answer = { svenskt_namn: "", beskrivning: "En tunn förrätt.", smak_och_storlek: "Len och rik.", ursprung: "", osakert: "" };

describe("swedishName", () => {
  it("is the Swedish name when it differs, and nothing for a Swedish menu, an empty name or the same name", () => {
    expect(swedishName(dish())).toBe("Carpaccio av iberisk presa med spån av foie gras");
    expect(swedishName(dish({ svenskt_namn: "" }))).toBeNull();
    expect(swedishName(dish({ svenskt_namn: undefined }))).toBeNull();
    expect(swedishName(dish({ originalnamn: "Margherita", svenskt_namn: "margherita" }))).toBeNull();
  });
});

describe("DishBlurb", () => {
  it("shows the Swedish name and the explanation under the printed name", () => {
    render(<DishBlurb dish={dish()} />);
    expect(screen.getByTestId("menu-dish-swedish")).toHaveTextContent("Carpaccio av iberisk presa med spån av foie gras");
    expect(screen.getByTestId("menu-dish-explanation")).toHaveTextContent("Tunt skivad svinnacke");
  });

  it("shows only the explanation for a dish already in Swedish", () => {
    render(<DishBlurb dish={dish({ svenskt_namn: "" })} />);
    expect(screen.queryByTestId("menu-dish-swedish")).toBeNull();
    expect(screen.getByTestId("menu-dish-explanation")).toBeInTheDocument();
  });
});

describe("MoreAboutDish", () => {
  beforeEach(() => forgetExplanations());

  it("asks once, shows the text, and keeps it for the next time the same dish is opened", async () => {
    const explain = vi.fn().mockResolvedValue(ok(answer));
    const { unmount } = render(<MoreAboutDish dish={dish()} menu={menu} explain={explain} />);
    await userEvent.click(screen.getByTestId("menu-dish-more-button"));
    expect(await screen.findByTestId("menu-dish-more")).toHaveTextContent("En tunn förrätt.");
    expect(explain).toHaveBeenCalledWith({ name: dish().originalnamn, language: "es", restaurant: "Taverna Mock", summary: dish().forklaring, ingredients: ["svinnacke", "foie gras"] });
    unmount();
    render(<MoreAboutDish dish={dish()} menu={menu} explain={explain} />);
    expect(screen.getByTestId("menu-dish-more")).toHaveTextContent("Len och rik.");
    expect(explain).toHaveBeenCalledTimes(1);
  });

  it("shows the Swedish name from the answer when the reading gave none", async () => {
    const explain = vi.fn().mockResolvedValue(ok({ ...answer, svenskt_namn: "Tunn skivad iberisk nacke" }));
    render(<MoreAboutDish dish={dish({ svenskt_namn: "" })} menu={menu} explain={explain} />);
    await userEvent.click(screen.getByTestId("menu-dish-more-button"));
    expect(await screen.findByTestId("menu-dish-more")).toHaveTextContent("Tunn skivad iberisk nacke");
  });

  it("says when it could not fetch more, for a failure and for a call that throws, and the button tries again", async () => {
    const explain = vi.fn().mockResolvedValueOnce(fail("ai_cap_reached")).mockRejectedValueOnce(new Error("net")).mockResolvedValue(ok(answer));
    render(<MoreAboutDish dish={dish()} menu={menu} explain={explain} />);
    const button = () => screen.getByTestId("menu-dish-more-button");
    await userEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att hämta mer om rätten just nu.");
    await userEvent.click(button());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(button());
    expect(await screen.findByTestId("menu-dish-more")).toBeInTheDocument();
    expect(explain).toHaveBeenCalledTimes(3);
  });
});
