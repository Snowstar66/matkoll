import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import type { RecipeDraft } from "../domain/recipe-draft";
import { RecipePreview } from "./recipe-preview";

const id = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";

const draft: RecipeDraft = {
  title: "Örtstekt kyckling",
  servings: 4,
  totalMinutes: 40,
  imageUrl: null,
  sourceKind: "photo",
  sourceUrl: null,
  steps: ["Värm ugnen.", { text: "Rosta potatisen.", title: "Rostad småpotatis" }],
  lines: [
    {
      originalText: "800 g småpotatis",
      amount: 800,
      unit: "g",
      isVague: false,
      ingredient: { kind: "match", ingredientId: id, confidence: "exact" },
      stepIndexes: [1],
      group: "Rostad småpotatis",
    },
    {
      originalText: "olivolja",
      amount: null,
      unit: null,
      isVague: true,
      ingredient: { kind: "match", ingredientId: id, confidence: "exact" },
      stepIndexes: [1],
      group: "Rostad småpotatis",
      isStapleMarked: true,
    },
    {
      originalText: "600 g kycklingfilé",
      amount: 600,
      unit: "g",
      isVague: false,
      ingredient: { kind: "match", ingredientId: id, confidence: "exact" },
      stepIndexes: [],
    },
  ],
};

/** The form with its draft in state, as the import sheet and Ändra recept hold it. */
function Harness({ onDraft }: { onDraft: (draft: RecipeDraft) => void }) {
  const [current, setCurrent] = useState(draft);
  return (
    <RecipePreview
      draft={current}
      names={{ [id]: "Potatis" }}
      onChange={(next) => {
        setCurrent(next);
        onDraft(next);
      }}
      pending={{}}
      onPendingChange={() => {}}
      errors={{}}
      searchIngredients={async () => ok([])}
    />
  );
}

const groupHeadings = () => screen.getAllByTestId("recipe-line-group-heading").map((heading) => heading.textContent);

describe("RecipePreview: ingredient groups and step headings", () => {
  it("shows a heading where the group changes, and Utan grupp for lines after a group", () => {
    render(<Harness onDraft={() => {}} />);
    expect(groupHeadings()).toEqual(["Rostad småpotatis", "Utan grupp"]);
  });

  it("changes a line's group under Ändra, offering the recipe's groups, and keeps focus while typing", async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    render(<Harness onDraft={onDraft} />);
    const rows = screen.getAllByTestId("recipe-line");
    await user.click(within(rows[2]).getByRole("button", { name: /^Ändra/ }));
    const group = within(rows[2]).getByLabelText(/Grupp/);
    expect(group).toHaveAttribute("maxLength", "60");
    const list = document.getElementById(group.getAttribute("list") ?? "");
    expect([...(list?.querySelectorAll("option") ?? [])].map((option) => option.value)).toEqual(["Rostad småpotatis"]);
    await user.type(group, "Örtstekt kyckling");
    expect(group).toHaveFocus();
    expect(onDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ lines: [draft.lines[0], draft.lines[1], { ...draft.lines[2], group: "Örtstekt kyckling" }] }),
    );
    expect(groupHeadings()).toEqual(["Rostad småpotatis", "Örtstekt kyckling"]);
    await user.clear(group);
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ lines: [draft.lines[0], draft.lines[1], { ...draft.lines[2], group: null }] }));
  });

  it("has a heading field per step, filled from the step, that adds and removes the heading", async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    render(<Harness onDraft={onDraft} />);
    const [first, second] = screen.getAllByRole("textbox", { name: /^Stegrubrik/ });
    expect(first).toHaveValue("");
    expect(second).toHaveValue("Rostad småpotatis");
    await user.type(first, "Ugn");
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ steps: [{ text: "Värm ugnen.", title: "Ugn" }, draft.steps[1]] }));
    await user.clear(second);
    expect(onDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ steps: [{ text: "Värm ugnen.", title: "Ugn" }, { text: "Rosta potatisen.", title: null }] }),
    );
  });
});
