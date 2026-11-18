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
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });
const settings = () => ({ actions: fakeSettings(), cost });
const all = [1, 2, 3, 4, 5, 6, 7];

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
  window.localStorage.clear();
  saveOption("weekAgent", true);
});

describe("WeekAgentCard with a waiting proposal", () => {
  const props = { href: "/start", draftHref: "/see", newHref: "/new", weekNumber: 47, filledDays: [], emptyDays: all, settings: settings() };
  const ok = () => vi.fn(async () => ({ status: "ok" as const }));

  it("a fresh draft: the chip Öppna utkast (no run), and Gör nytt and Förkasta behind the ⋯", async () => {
    const user = userEvent.setup();
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "fresh" }} discard={ok()} />);
    expect(screen.getByRole("link", { name: "Öppna utkast" })).toHaveAttribute("href", "/see");
    expect(screen.queryByRole("link", { name: "Gör nytt" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Förkasta" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Fler val för förslaget" }));
    expect(screen.getByRole("menuitem", { name: "Gör nytt" })).toHaveAttribute("href", "/new");
    expect(screen.getByRole("menuitem", { name: "Förkasta" })).toBeInTheDocument();
  });

  it("an old draft is left out of the row: the chip is Föreslå veckan and there is no Förkasta", () => {
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "old" }} discard={ok()} />);
    expect(screen.getByTestId("week-agent-card-link")).toHaveTextContent("Föreslå veckan");
    expect(screen.queryByText("Öppna utkast")).toBeNull();
    expect(screen.queryByRole("button", { name: "Fler val för förslaget" })).toBeNull();
  });

  it("an old draft on a partly filled week keeps Fyll resten in the chip", () => {
    render(<WeekAgentCard {...props} filledDays={[4]} emptyDays={[1, 2, 3, 5, 6, 7]} draft={{ id: "d", freshness: "old" }} />);
    expect(screen.getByTestId("week-agent-card-link")).toHaveTextContent("Fyll resten");
  });

  it("Förkasta asks first, then throws the draft away and refreshes the row", async () => {
    const user = userEvent.setup();
    const discard = ok();
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "fresh" }} discard={discard} />);
    await user.click(screen.getByRole("button", { name: "Fler val för förslaget" }));
    await user.click(screen.getByRole("menuitem", { name: "Förkasta" }));
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
    const { unmount } = render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "fresh" }} discard={gone} />);
    await user.click(screen.getByRole("button", { name: "Fler val för förslaget" }));
    await user.click(screen.getByRole("menuitem", { name: "Förkasta" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Förkasta" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    unmount();
    refresh.mockClear();
    const failing = vi.fn(async () => ({ status: "error" as const, message: "Det gick inte just nu." }));
    render(<WeekAgentCard {...props} draft={{ id: "d", freshness: "fresh" }} discard={failing} />);
    await user.click(screen.getByRole("button", { name: "Fler val för förslaget" }));
    await user.click(screen.getByRole("menuitem", { name: "Förkasta" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Förkasta" }));
    expect(await screen.findByText("Det gick inte just nu.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("WeekAgentCard", () => {
  it("is not there with the Tillval off", () => {
    saveOption("weekAgent", false);
    render(<WeekAgentCard href="/x" weekNumber={47} filledDays={[]} emptyDays={all} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-card-link")).toBeNull();
  });

  it("is one chip, Föreslå veckan on an empty week, that opens the sheet Veckans inriktning and runs nothing", async () => {
    const user = userEvent.setup();
    render(<WeekAgentCard href="/matsedel/veckoforslag?vecka=2026-W47&starta=1" weekNumber={47} filledDays={[]} emptyDays={all} settings={settings()} />);
    const chip = screen.getByTestId("week-agent-card-link");
    expect(chip).toHaveTextContent("Föreslå veckan");
    expect(chip).toHaveAttribute("data-state", "empty");
    expect(chip).not.toHaveTextContent("Vecka 47 är tom");
    await user.click(chip);
    const dialog = await screen.findByRole("dialog", { name: "Veckans inriktning" });
    expect(within(dialog).getByTestId("week-agent-settings-intro")).toHaveTextContent("Förslag på middagar efter vad du har hemma och vad som är på erbjudande.");
    expect(push).not.toHaveBeenCalled();
  });

  it("says Fyll resten, and the sheet keeps the sentence that the household's own dishes stay", async () => {
    const user = userEvent.setup();
    render(<WeekAgentCard href="/x" weekNumber={47} filledDays={[1, 4]} emptyDays={[2, 3, 5, 6, 7]} settings={settings()} />);
    const chip = screen.getByTestId("week-agent-card-link");
    expect(chip).toHaveTextContent("Fyll resten");
    await user.click(chip);
    expect(await screen.findByTestId("week-agent-settings-intro")).toHaveTextContent("5 lediga dagar. Dina rätter (måndag och torsdag) ligger kvar som de är.");
    expect(screen.getByTestId("week-agent-settings-start")).toHaveTextContent("Fyll resten");
  });

  it("is gone on a full week and on a week with nothing left to plan", () => {
    const { rerender } = render(<WeekAgentCard href="/x" weekNumber={47} filledDays={all} emptyDays={[]} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-card-link")).toBeNull();
    rerender(<WeekAgentCard href="/x" weekNumber={47} filledDays={[]} emptyDays={[]} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-card-link")).toBeNull();
  });

  it("Hoppa över starts the proposal at once and saves nothing, also after something was changed", async () => {
    const user = userEvent.setup();
    const actions = fakeSettings();
    render(<WeekAgentCard href="/go" weekNumber={47} filledDays={[]} emptyDays={all} settings={{ actions, cost }} />);
    await user.click(screen.getByTestId("week-agent-card-link"));
    await user.click(await screen.findByRole("button", { name: "Färre middagar" }));
    await user.click(screen.getByTestId("week-agent-settings-skip"));
    expect(actions.save).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/go");
  });

  it("Föreslå veckan in the sheet starts at once when nothing was changed", async () => {
    const user = userEvent.setup();
    const actions = fakeSettings();
    render(<WeekAgentCard href="/go" weekNumber={47} filledDays={[]} emptyDays={all} settings={{ actions, cost }} />);
    await user.click(screen.getByTestId("week-agent-card-link"));
    await user.click(await screen.findByTestId("week-agent-settings-start"));
    expect(actions.save).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/go");
  });

  it("Föreslå veckan in the sheet saves what was changed, then starts", async () => {
    const user = userEvent.setup();
    const actions = fakeSettings();
    render(<WeekAgentCard href="/go" weekNumber={47} filledDays={[]} emptyDays={all} settings={{ actions, cost }} />);
    await user.click(screen.getByTestId("week-agent-card-link"));
    await user.click(await screen.findByRole("button", { name: "Färre middagar" }));
    await user.click(screen.getByTestId("week-agent-settings-start"));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ dinners: 6 })));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/go"));
  });

  it("the chip is 34 px with a 44 px tap area, and the sheet's two buttons are named for what they do", async () => {
    const user = userEvent.setup();
    render(<WeekAgentCard href="/x" weekNumber={47} filledDays={[]} emptyDays={all} settings={settings()} />);
    expect(screen.getByRole("button", { name: /Föreslå veckan/ }).className).toContain("before:-inset-y-[5px]");
    await user.click(screen.getByRole("button", { name: /Föreslå veckan/ }));
    expect(await screen.findByRole("button", { name: "Hoppa över" })).toBeInTheDocument();
  });
});

describe("WeekAgentMenu", () => {
  const load = vi.fn(async () => [2, 3, 5, 6, 7] as number[] | null);

  it("is there on every week with something to plan, only with the Tillval on, and not on a week that is past", () => {
    const { rerender } = render(<WeekAgentMenu redoHref="/r" filledDays={[1, 4]} emptyDays={[2, 3]} loadAgentDays={load} settings={settings()} />);
    expect(screen.getByTestId("week-agent-menu")).toBeInTheDocument();
    rerender(<WeekAgentMenu redoHref="/r" filledDays={[]} emptyDays={[]} loadAgentDays={load} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-menu")).toBeNull();
    rerender(<WeekAgentMenu redoHref="/r" filledDays={all} emptyDays={[]} loadAgentDays={load} settings={settings()} />);
    expect(screen.getByRole("button", { name: "Fler val för veckan" })).toBeInTheDocument();
    saveOption("weekAgent", false);
    rerender(<WeekAgentMenu redoHref="/r" filledDays={all} emptyDays={[]} loadAgentDays={load} settings={settings()} />);
    expect(screen.queryByTestId("week-agent-menu")).toBeNull();
  });

  it("on a week with free days has only Ställ in, which opens the settings sheet", async () => {
    const user = userEvent.setup();
    render(<WeekAgentMenu redoHref="/r" filledDays={[]} emptyDays={all} loadAgentDays={load} settings={settings()} />);
    await user.click(screen.getByTestId("week-agent-menu"));
    expect(screen.queryByTestId("week-agent-redo")).toBeNull();
    await user.click(await screen.findByTestId("week-agent-menu-settings"));
    expect(await screen.findByRole("dialog", { name: "Ställ in veckoförslaget" })).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
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
