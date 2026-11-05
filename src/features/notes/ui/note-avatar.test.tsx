import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { avatarMoods } from "../domain/note";
import { NoteAvatar } from "./note-avatar";

const draw = (mood: (typeof avatarMoods)[number], state: "idle" | "talking" | "pointing" = "idle") =>
  render(<NoteAvatar mood={mood} state={state} />).container.querySelector("svg") as SVGSVGElement;

describe("NoteAvatar", () => {
  it("is decoration and carries its mood and state for the stylesheet", () => {
    const svg = draw("glad", "talking");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("data-mood")).toBe("glad");
    expect(svg.getAttribute("data-state")).toBe("talking");
  });

  it("draws a different mouth for every mood", () => {
    const mouths = avatarMoods.map((mood) => draw(mood).querySelector(".na-mouth")?.getAttribute("d"));
    expect(new Set(mouths).size).toBe(avatarMoods.length);
  });

  it("gives each mood its own signs, drawn in the markup (so they show without motion)", () => {
    expect(draw("karleksfull").querySelectorAll(".na-heart").length).toBe(3);
    expect(draw("glad").querySelector(".na-heart")).toBeNull();
    expect(draw("stressad").querySelector(".na-sweat")).not.toBeNull();
    expect(draw("neutral").querySelector(".na-sweat")).toBeNull();
    const arg = draw("arg");
    expect(arg.querySelector(".na-crossed")).not.toBeNull();
    expect(arg.querySelector(".na-arm-point")).toBeNull();
    expect(arg.querySelector(".na-brows")).not.toBeNull();
    expect(draw("glad").querySelector(".na-crossed")).toBeNull();
  });

  it("keeps the pointing arm in every mood but arg", () => {
    for (const mood of avatarMoods.filter((candidate) => candidate !== "arg")) expect(draw(mood, "pointing").querySelector(".na-arm-point")).not.toBeNull();
  });
});
