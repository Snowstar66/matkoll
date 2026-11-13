import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { person } from "../domain/fixtures";
import type { Person } from "../domain/profile";
import { TasteSection } from "./preference-section";
import { TasteSlider } from "./taste-slider";

// The slider of one taste and the grouped list of them: five snap positions, the arrow keys, groups that fold, a calm
// summary, and own things.

function Harness({ start = person(), onSave }: { start?: Person; onSave?: (person: Person) => void }) {
  const [current, setCurrent] = useState(start);
  return (
    <TasteSection
      person={current}
      onChange={(next) => {
        setCurrent(next);
        onSave?.(next);
      }}
    />
  );
}

describe("TasteSlider", () => {
  it("is a slider with the five steps as words, and moves with the arrow keys, Home and End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TasteSlider label="Fisk" value={0} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Fisk" });
    expect(slider).toHaveAttribute("aria-valuemin", "-2");
    expect(slider).toHaveAttribute("aria-valuemax", "2");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(slider).toHaveAttribute("aria-valuetext", "Okej");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(1);
    await user.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith(1);
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith(-1);
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(-2);
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("does not go past the ends, and names every step", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TasteSlider label="Fisk" value={2} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    for (const [value, word] of [
      [-2, "Ogillar"],
      [-1, "Hellre inte"],
      [0, "Okej"],
      [1, "Gillar"],
      [2, "Älskar"],
    ] as const) {
      rerender(<TasteSlider label="Fisk" value={value} onChange={onChange} />);
      expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", word);
    }
  });

  it("has a handle of 44 px (the tap size) and lets the page scroll up and down", () => {
    render(<TasteSlider label="Fisk" value={0} onChange={() => {}} />);
    expect(screen.getByTestId("taste-handle").className).toContain("size-tap");
    expect(screen.getByRole("slider").className).toContain("h-tap");
    expect(screen.getByRole("slider").style.touchAction).toBe("pan-y");
  });

  it("snaps a tap or a drag to the nearest step and saves when the finger is lifted", () => {
    const onChange = vi.fn();
    render(<TasteSlider label="Fisk" value={0} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    // The rail is 400 px wide from x = 0: the steps are at 0, 100, 200, 300 and 400.
    const rail = slider.firstElementChild as HTMLElement;
    rail.getBoundingClientRect = () => ({ left: 0, right: 400, width: 400, top: 0, bottom: 44, height: 44, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(slider, { clientX: 390, pointerId: 1 });
    expect(slider).toHaveAttribute("aria-valuenow", "2");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(slider, { clientX: 130, pointerId: 1 });
    expect(slider).toHaveAttribute("aria-valuenow", "-1");
    fireEvent.pointerMove(slider, { clientX: 20, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 20, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(-2);
  });

  it("drops a drag the browser takes over (a scroll) without saving", () => {
    const onChange = vi.fn();
    render(<TasteSlider label="Fisk" value={1} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    const rail = slider.firstElementChild as HTMLElement;
    rail.getBoundingClientRect = () => ({ left: 0, right: 400, width: 400, top: 0, bottom: 44, height: 44, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(slider, { clientX: 0, pointerId: 1 });
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-valuenow", "1");
  });
});

describe("TasteSection", () => {
  it("is calm with nothing filled in: three folded groups saying Okej, and the summary says it eats everything", () => {
    render(<Harness />);
    expect(screen.getByTestId("taste-summary")).toHaveTextContent("Inget ifyllt: äter allt");
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(3);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    for (const id of ["protein", "ratter", "smaker"]) expect(screen.getByTestId(`taste-group-${id}-summary`)).toHaveTextContent("Okej");
  });

  it("opens a group to its sliders, all Okej and toned, and folds it again", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const protein = screen.getByRole("button", { name: /Protein/ });
    await user.click(protein);
    expect(protein).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("slider").map((slider) => slider.getAttribute("aria-label"))).toEqual(["Rött kött", "Fläskkött", "Kyckling", "Fisk", "Skaldjur", "Vegetariskt"]);
    for (const row of screen.getAllByTestId("taste-row")) {
      expect(row).toHaveAttribute("data-set", "false");
      expect(row).toHaveTextContent("Okej");
    }
    await user.click(protein);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("shows the many presets in their groups (7 dishes, 12 tastes) when opened", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Maträtter/ }));
    await user.click(screen.getByRole("button", { name: /Smaker och råvaror/ }));
    expect(screen.getAllByRole("slider")).toHaveLength(7 + 12);
  });

  it("counts what is set on the group row and in the summary, and saves each move", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness start={person({ name: "Anna" })} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /Protein/ }));
    screen.getByRole("slider", { name: "Fisk" }).focus();
    await user.keyboard("{End}");
    screen.getByRole("slider", { name: "Skaldjur" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ tastes: { fisk: 2, skaldjur: -1 } }));
    expect(screen.getByTestId("taste-group-protein-summary")).toHaveTextContent("2 inställda");
    expect(screen.getByTestId("taste-summary")).toHaveTextContent("Anna älskar fisk. Undviker skaldjur.");
    expect(within(screen.getAllByTestId("taste-row")[3]!).getByText("Älskar")).toBeInTheDocument();
    expect(screen.getAllByTestId("taste-row")[3]).toHaveAttribute("data-set", "true");
  });

  it("says 1 inställd for one, and moving back to Okej stores nothing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness start={person({ tastes: { kott: -1 } })} onSave={onSave} />);
    expect(screen.getByTestId("taste-group-protein-summary")).toHaveTextContent("1 inställd");
    await user.click(screen.getByRole("button", { name: /Protein/ }));
    screen.getByRole("slider", { name: "Rött kött" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ tastes: {} }));
    expect(screen.getByTestId("taste-group-protein-summary")).toHaveTextContent("Okej");
  });

  it("adds an own thing as its own row with its own slider, in a group of its own that is open", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await user.type(screen.getByRole("textbox", { name: "Lägg till egen sak" }), "Rödbetor");
    await user.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(screen.getByTestId("taste-group-egna")).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "Rödbetor" });
    expect(onSave).not.toHaveBeenCalled();
    slider.focus();
    await user.keyboard("{Home}");
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ tastes: { rödbetor: -2 } }));
    expect(screen.getByTestId("taste-summary")).toHaveTextContent("Anna undviker rödbetor.");
  });

  it("opens the own group at once when the person already has own things", () => {
    render(<Harness start={person({ tastes: { "nasi goreng": 2 } })} />);
    expect(screen.getByRole("slider", { name: "Nasi goreng" })).toBeInTheDocument();
  });
});
