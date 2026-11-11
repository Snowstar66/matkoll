import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { saveOption } from "@/lib/options";
import { cost, fakeSettings } from "./fake-actions";
import { WeekAgentCard } from "./week-card";
import { WeekAgentMenu } from "./week-menu";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });
const settings = () => ({ actions: fakeSettings(), cost });
const all = [1, 2, 3, 4, 5, 6, 7];

beforeEach(() => {
  refresh.mockClear();
  window.localStorage.clear();
  saveOption("weekAgent", true);
});

describe("WeekAgentCard with a waiting proposal", () => {
  const props = { href: "/start", draftHref: "/see", newHref: "/new", weekNumber: 47, filledDays: [], emptyDays: all, settings: settings() };
  const ok = () => vi.fn(async () => ({ status: "ok" as const }));

  it("a fresh draft: Du har ett förslag på väntan, Se förslaget (no run), Gör nytt and Förkasta", () => {
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "fresh" }} discard={ok()} />);
    expect(screen.getByTestId("week-agent-card")).toHaveTextContent("Du har ett förslag på väntan");
    expect(screen.getByRole("link", { name: "Se förslaget" })).toHaveAttribute("href", "/see");
    expect(screen.getByRole("link", { name: "Gör nytt" })).toHaveAttribute("href", "/new");
    expect(screen.getByRole("button", { name: "Förkasta" })).toBeInTheDocument();
  });

  it("an old draft: says it is old, keeps Föreslå veckan as the way to a new proposal, and a small Förkasta", () => {
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "old" }} discard={ok()} />);
    const card = screen.getByTestId("week-agent-card");
    expect(card).toHaveTextContent("Ditt förra förslag är gammalt. Gör nytt?");
    expect(screen.queryByText("Se förslaget")).toBeNull();
    expect(screen.getByTestId("week-agent-card-link")).toHaveAttribute("href", "/start");
    expect(card).toHaveTextContent("Föreslå veckan");
    expect(screen.getByRole("button", { name: "Förkasta" })).toBeInTheDocument();
  });

  it("an old draft on a partly filled week keeps Fyll resten av veckan in the button", () => {
    render(<WeekAgentCard {...props} filledDays={[4]} emptyDays={[1, 2, 3, 5, 6, 7]} draft={{ id: "d", freshness: "old" }} />);
    expect(screen.getByTestId("week-agent-card")).toHaveTextContent("Fyll resten av veckan");
  });

  it("without a draft it is the card as before, with no Förkasta", () => {
    render(<WeekAgentCard {...props} discard={ok()} />);
    expect(screen.getByTestId("week-agent-card")).toHaveTextContent("Föreslå veckan");
    expect(screen.queryByRole("button", { name: "Förkasta" })).toBeNull();
  });

  it("Förkasta asks first, then throws the draft away and refreshes the card", async () => {
    const user = userEvent.setup();
    const discard = ok();
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "fresh" }} discard={discard} />);
    await user.click(screen.getByRole("button", { name: "Förkasta" }));
    const dialog = await screen.findByRole("dialog", { name: "Förkasta förslaget?" });
    expect(dialog).toHaveTextContent("Inget ändras i Matsedel.");
    expect(discard).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Förkasta" }));
    await waitFor(() => expect(discard).toHaveBeenCalledWith({ draftId: "d" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("when the draft is already gone it only refreshes; a real error stays in the sheet", async () => {
    const user = userEvent.setup();
    const gone = vi.fn(async () => ({ status: "error" as const, message: "x", code: "no_draft" as const }));
    const { unmount } = render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "old" }} discard={gone} />);
    await user.click(screen.getByRole("button", { name: "Förkasta" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Förkasta" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    unmount();
    refresh.mockClear();
    const failing = vi.fn(async () => ({ status: "error" as const, message: "Det gick inte just nu." }));
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "old" }} discard={failing} />);
    await user.click(screen.getByRole("button", { name: "Förkasta" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Förkasta" }));
    expect(await screen.findByText("Det gick inte just nu.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
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
