import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { saveOption } from "@/lib/options";
import { cost, fakeSettings } from "./fake-actions";
import { WeekAgentCard } from "./week-card";
import { WeekAgentMenu } from "./week-menu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });
const settings = () => ({ actions: fakeSettings(), cost });
const all = [1, 2, 3, 4, 5, 6, 7];

beforeEach(() => {
  window.localStorage.clear();
  saveOption("weekAgent", true);
});

describe("WeekAgentCard", () => {
  it("is not there with the Tillval off", () => {
    saveOption("weekAgent", false);
    render(<WeekAgentCard href="/x" weekNumber={47} filledDays={[]} emptyDays={all} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-card")).toBeNull();
  });

  it("says Föreslå veckan on an empty week and links to the proposal", () => {
    render(<WeekAgentCard href="/matsedel/veckoforslag?vecka=2026-W47&starta=1" weekNumber={47} filledDays={[]} emptyDays={all} settings={settings()} />);
    const link = screen.getByTestId("week-agent-card-link");
    expect(link).toHaveAttribute("href", "/matsedel/veckoforslag?vecka=2026-W47&starta=1");
    expect(link).toHaveTextContent("Föreslå veckan");
    expect(link).toHaveTextContent("Vecka 47 är tom. Få ett förslag på middagar efter vad du har hemma och vad som är på erbjudande.");
    expect(screen.getByTestId("week-agent-card")).toHaveAttribute("data-state", "empty");
  });

  it("says Fyll resten av veckan with the free days when some days are filled", () => {
    render(<WeekAgentCard href="/x" weekNumber={47} filledDays={[1, 4]} emptyDays={[2, 3, 5, 6, 7]} settings={settings()} />);
    const link = screen.getByTestId("week-agent-card-link");
    expect(link).toHaveTextContent("Fyll resten av veckan");
    expect(link).toHaveTextContent("5 lediga dagar. Dina rätter (måndag och torsdag) ligger kvar som de är.");
  });

  it("is gone on a full week and on a week with nothing left to plan", () => {
    const { rerender } = render(<WeekAgentCard href="/x" weekNumber={47} filledDays={all} emptyDays={[]} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-card")).toBeNull();
    rerender(<WeekAgentCard href="/x" weekNumber={47} filledDays={[]} emptyDays={[]} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-card")).toBeNull();
  });

  it("opens Ställ in from the card and saves what was changed", async () => {
    const user = userEvent.setup();
    const actions = fakeSettings();
    render(<WeekAgentCard href="/x" weekNumber={47} filledDays={[]} emptyDays={all} settings={{ actions, cost }} />);
    await user.click(screen.getByTestId("week-agent-card-settings"));
    expect(await screen.findByRole("dialog", { name: "Ställ in veckoförslaget" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Fler middagar" }));
    await user.click(screen.getByTestId("week-agent-settings-save"));
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ dinners: 6 }));
  });

  it("has targets that can be reached: the link and the button name what they do", () => {
    render(<WeekAgentCard href="/x" weekNumber={47} filledDays={[]} emptyDays={all} settings={settings()} />);
    expect(screen.getByRole("link", { name: /Föreslå veckan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ställ in" }).className).toContain("min-h-tap");
  });
});

describe("WeekAgentMenu", () => {
  const load = vi.fn(async () => [2, 3, 5, 6, 7] as number[] | null);

  it("is only there for a full week with the Tillval on", () => {
    const { rerender } = render(<WeekAgentMenu redoHref="/r" filledDays={[1, 4]} emptyDays={[2, 3]} loadAgentDays={load} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-menu")).toBeNull();
    rerender(<WeekAgentMenu redoHref="/r" filledDays={all} emptyDays={[]} loadAgentDays={load} settings={settings()} />);
    expect(screen.getByRole("button", { name: "Fler val för veckan" })).toBeInTheDocument();
    saveOption("weekAgent", false);
    rerender(<WeekAgentMenu redoHref="/r" filledDays={all} emptyDays={[]} loadAgentDays={load} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-menu")).toBeNull();
  });

  it("says Gör om de olåsta with how many it changes and keeps, and links to the redo", async () => {
    const user = userEvent.setup();
    render(<WeekAgentMenu redoHref="/matsedel/veckoforslag?vecka=2026-W47&gor-om=1" filledDays={all} emptyDays={[]} loadAgentDays={load} settings={settings()} />);
    await user.click(screen.getByTestId("week-agent-menu"));
    const redo = await screen.findByRole("menuitem", { name: /Gör om de olåsta/ });
    expect(redo).toHaveAttribute("href", "/matsedel/veckoforslag?vecka=2026-W47&gor-om=1");
    expect(redo).toHaveTextContent("Byter 5 rätter. Dina 2 ligger kvar.");
  });

  it("says Gör om veckan when none of the dishes are the household's own, and when nothing is known about them", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WeekAgentMenu redoHref="/r" filledDays={all} emptyDays={[]} loadAgentDays={async () => all} settings={settings()} />);
    await user.click(screen.getByTestId("week-agent-menu"));
    expect(await screen.findByRole("menuitem", { name: /Gör om veckan/ })).toBeInTheDocument();
    unmount();
    render(<WeekAgentMenu redoHref="/r" filledDays={all} emptyDays={[]} loadAgentDays={async () => null} settings={settings()} />);
    await user.click(screen.getByTestId("week-agent-menu"));
    expect(await screen.findByRole("menuitem", { name: /Gör om veckan/ })).toBeInTheDocument();
  });

  it("closes on Escape and gives focus back to the button", async () => {
    const user = userEvent.setup();
    render(<WeekAgentMenu redoHref="/r" filledDays={all} emptyDays={[]} loadAgentDays={load} settings={settings()} />);
    const button = screen.getByTestId("week-agent-menu");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });
});
