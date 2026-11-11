import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { saveOption } from "@/lib/options";
import { cost, draftId, fakeActions, fakeSettings, okResult, proposal, proposalAroundFixed, rid, weekStart } from "./fake-actions";
import { ProposalScreen, type ProposalDraft, type ProposalScreenProps } from "./proposal-screen";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ToastProvider });
const draft = (p = proposal(), model: string | null = "haiku-5.5"): ProposalDraft => ({ id: draftId, proposal: p, model });

function screenWith(props: Partial<ProposalScreenProps> = {}) {
  const actions = props.actions ?? fakeActions();
  return {
    actions,
    ui: (
      <ProposalScreen
        weekStart={weekStart}
        weekNumber={47}
        backHref="/matsedel?vecka=2026-W47"
        recipesHref="/recept"
        initialDraft={null}
        autoStart={false}
        settings={{ actions: fakeSettings(), cost }}
        {...props}
        actions={actions}
      />
    ),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  saveOption("weekAgent", true);
  push.mockClear();
  refresh.mockClear();
});

describe("ProposalScreen: a proposal", () => {
  it("shows a row per dinner with its reason, the draft pill and that nothing is saved", () => {
    const { ui } = screenWith({ initialDraft: draft() });
    render(ui);
    expect(screen.getByRole("heading", { name: "Förslag för vecka 47" })).toBeInTheDocument();
    expect(screen.getByTestId("proposal-pill")).toHaveTextContent("Utkast");
    expect(screen.getByTestId("proposal-summary")).toHaveTextContent("5 middagar. Inget är sparat förrän du trycker Använd veckan.");
    const rows = screen.getAllByTestId("proposal-day");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("MÅN");
    expect(rows[0]).toHaveTextContent("16");
    expect(rows[0]).toHaveTextContent("Pasta med köttfärssås");
    expect(rows[0]).toHaveTextContent("Skäl för Pasta med köttfärssås.");
    expect(screen.getByTestId("proposal-off")).toHaveTextContent("Ingen middag planerad lördag och söndag");
  });

  it("shows offer and use-soon tags", () => {
    const p = proposal({
      2: { offerTags: [{ name: "Laxfilé", price: "129 kr/kg", store: "ICA" }] },
      4: { useSoonTags: [{ name: "Kyckling", expiresWeekday: 5 }] },
    });
    render(screenWith({ initialDraft: draft(p) }).ui);
    expect(screen.getByTestId("offer-tag")).toHaveTextContent("Laxfilé 129 kr/kg");
    expect(screen.getByTestId("use-soon-tag")).toHaveTextContent("Går ut fre");
  });

  it("shows the household's own dish as Din rätt, locked, with no Byt, and an allergy in red with the person", () => {
    render(screenWith({ initialDraft: draft(proposalAroundFixed()) }).ui);
    const thursday = screen.getAllByTestId("proposal-day").find((row) => row.getAttribute("data-day") === "4");
    if (!thursday) throw new Error("no thursday");
    expect(thursday).toHaveAttribute("data-source", "fixed");
    expect(thursday).toHaveTextContent("Din rätt");
    expect(within(thursday).queryByRole("button", { name: /Byt/ })).toBeNull();
    expect(within(thursday).queryByRole("button", { name: /Lås/ })).toBeNull();
    expect(within(thursday).getByRole("img", { name: /din rätt/ })).toBeInTheDocument();
    const flag = within(thursday).getByTestId("allergy-flag");
    expect(flag).toHaveTextContent("Kan innehålla laktos (Anna)");
    expect(flag.className).toContain("text-danger");
    expect(screen.getByTestId("proposal-summary")).toHaveTextContent("4 förslag runt din 1 rätt.");
    expect(screen.getByRole("button", { name: "Gör om 4 olåsta" })).toBeInTheDocument();
  });

  it("locks a day and shows it locked; Byt is gone for it", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    actions.setLock.mockResolvedValue({ status: "ok", proposal: proposal({ 2: { locked: true } }) });
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByRole("button", { name: "Lås tisdag" }));
    expect(actions.setLock).toHaveBeenCalledWith({ draftId, dayIndex: 2, locked: true });
    expect(await screen.findByRole("button", { name: "Lås upp tisdag" })).toHaveAttribute("aria-pressed", "true");
    const tuesday = screen.getAllByTestId("proposal-day").find((row) => row.getAttribute("data-day") === "2");
    expect(tuesday && within(tuesday).queryByRole("button", { name: "Byt tisdag" })).toBeNull();
    expect(tuesday).toHaveTextContent("Låst av dig");
  });

  it("re-rolls the unlocked days and says how many changed", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    actions.propose.mockResolvedValue(okResult(proposal({ 1: { title: "Torsk med rotfrukter", recipeId: rid(30) }, 3: { title: "Grönsakscurry", recipeId: rid(31) } })));
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByTestId("proposal-reroll"));
    expect(actions.propose).toHaveBeenCalledWith({ weekStart, mode: "reroll", lockedDays: [] });
    expect(await screen.findByText("Torsk med rotfrukter")).toBeInTheDocument();
    expect(screen.getByTestId("proposal-status")).toHaveTextContent("Bytte 2 dagar.");
  });

  it("asks for the careful run from the menu, and tells what it costs", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByTestId("proposal-menu"));
    const careful = screen.getByRole("menuitem", { name: /Gör noggrannare/ });
    expect(careful).toHaveTextContent("kostar ca 0,18 kr i stället för ca 0,01 kr");
    await user.click(careful);
    expect(actions.propose).toHaveBeenCalledWith(expect.objectContaining({ mode: "careful" }));
  });

  it("marks a proposal made by the rules without AI as Enkelt förslag", () => {
    render(screenWith({ initialDraft: draft(proposal(), "rules") }).ui);
    expect(screen.getByTestId("proposal-pill")).toHaveTextContent("Enkelt förslag");
    expect(screen.getByText("Förslaget är framräknat av appen utan AI, så förklaringarna är kortare.")).toBeInTheDocument();
  });

  it("lists the recipes left out for an allergy by name and never hides them", async () => {
    const user = userEvent.setup();
    const { ui } = screenWith({ initialDraft: null, autoStart: true, actions: fakeActions({ propose: vi.fn(async () => okResult(proposal(), { excludedForAllergy: [{ recipeId: rid(50), title: "Pannkakor", allergens: ["laktos"] }] })) }) });
    render(ui);
    const note = await screen.findByTestId("proposal-excluded");
    expect(note).toHaveTextContent("1 recept lämnades utanför för att det kan innehålla en allergen.");
    await user.click(within(note).getByRole("button", { name: "Visa" }));
    expect(screen.getByTestId("proposal-excluded-list")).toHaveTextContent("Pannkakor (laktos)");
  });
});

describe("ProposalScreen: swapping a day", () => {
  it("opens the alternatives, marks an allergy dish red with Välj ändå, and swaps", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByRole("button", { name: "Byt tisdag" }));
    expect(await screen.findByRole("dialog", { name: "Byt tisdag" })).toBeInTheDocument();
    expect(actions.alternatives).toHaveBeenCalledWith({ draftId, dayIndex: 2 });
    const options = await screen.findAllByTestId("alternative");
    expect(options).toHaveLength(2);
    expect(within(options[1] as HTMLElement).getByTestId("allergy-flag")).toHaveTextContent("Kan innehålla laktos (Anna)");
    expect(within(options[1] as HTMLElement).getByRole("button", { name: "Välj ändå Krämig kycklinggryta" })).toBeInTheDocument();
    await user.click(within(options[0] as HTMLElement).getByRole("button", { name: "Välj Broccolipasta" }));
    expect(actions.swap).toHaveBeenCalledWith({ draftId, dayIndex: 2, recipeId: rid(20) });
    expect(await screen.findByText("Broccolipasta")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Byt tisdag" })).toBeNull());
  });

  it("says so when the alternatives cannot be fetched", async () => {
    const user = userEvent.setup();
    const actions = fakeActions({ alternatives: vi.fn(async () => ({ status: "error" as const, message: "Det gick inte att hämta andra rätter." })) });
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByRole("button", { name: "Byt tisdag" }));
    expect(await screen.findByText("Det gick inte att hämta andra rätter.")).toBeInTheDocument();
  });
});

describe("ProposalScreen: Använd veckan", () => {
  it("writes the days, goes back to Matsedel and shows a toast with Ångra for ten seconds", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    render(screenWith({ initialDraft: draft(proposalAroundFixed()), actions }).ui);
    await user.click(screen.getByTestId("proposal-use"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/matsedel?vecka=2026-W47"));
    expect(actions.apply).toHaveBeenCalledWith({ draftId, weekStart });
    expect(await screen.findByTestId("toast")).toHaveTextContent("5 rätter tillagda. Din 1 låg kvar.");
    await user.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(actions.undo).toHaveBeenCalledWith({ draftId }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows how many things to buy when the backend says, and says so when Ångra fails", async () => {
    const user = userEvent.setup();
    const actions = fakeActions({ apply: vi.fn(async () => ({ status: "ok" as const, written: [1, 2, 3, 5], skippedOccupied: [], toBuy: 14 })) });
    actions.undo.mockResolvedValueOnce({ status: "error", message: "Det gick inte att ångra." });
    render(screenWith({ initialDraft: draft(proposalAroundFixed()), actions }).ui);
    await user.click(screen.getByTestId("proposal-use"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("14 varor att köpa.");
    await user.click(screen.getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(actions.undo).toHaveBeenCalled());
    expect((await screen.findAllByText("Det gick inte att ångra.")).length).toBeGreaterThan(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("has no Ångra when the backend has no undo", async () => {
    const user = userEvent.setup();
    render(screenWith({ initialDraft: draft(), actions: fakeActions({}, false) }).ui);
    await user.click(screen.getByTestId("proposal-use"));
    expect(await screen.findByTestId("toast")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ångra" })).toBeNull();
  });

  it("asks before it replaces days (a redo of a full week), then sends replaceAgentDays and never overwrite", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    render(screenWith({ initialDraft: draft(proposalAroundFixed()), redo: { ownDays: [4] }, actions }).ui);
    await user.click(screen.getByTestId("proposal-use"));
    const question = await screen.findByRole("dialog", { name: "Byta ut 4 rätter i Matsedel?" });
    expect(actions.apply).not.toHaveBeenCalled();
    expect(question).toHaveTextContent("Din egen rätt ligger kvar.");
    await user.click(within(question).getByRole("button", { name: "Byt ut och använd" }));
    await waitFor(() => expect(actions.apply).toHaveBeenCalledWith({ draftId, weekStart, replaceAgentDays: true }));
  });

  it("keeps the redo after the address lost ?gor-om (the page then passes no redo), so Använd veckan still replaces the agent's days", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    const { rerender } = render(screenWith({ initialDraft: draft(proposalAroundFixed()), redo: { ownDays: [4] }, actions }).ui);
    rerender(screenWith({ initialDraft: draft(proposalAroundFixed()), redo: null, actions }).ui);
    await user.click(screen.getByTestId("proposal-use"));
    await user.click(within(await screen.findByRole("dialog", { name: "Byta ut 4 rätter i Matsedel?" })).getByRole("button", { name: "Byt ut och använd" }));
    await waitFor(() => expect(actions.apply).toHaveBeenCalledWith({ draftId, weekStart, replaceAgentDays: true }));
  });

  it("when a day was filled meanwhile, keeps it unless the user says Byt till förslaget", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    actions.apply.mockResolvedValueOnce({ status: "ok", written: [1, 2, 4, 5], skippedOccupied: [3] });
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByTestId("proposal-use"));
    const dialog = await screen.findByRole("dialog", { name: "Onsdag har fått en rätt" });
    expect(screen.getByTestId("proposal-conflict")).toHaveTextContent("onsdag");
    expect(push).not.toHaveBeenCalled();
    await user.click(within(dialog).getByTestId("proposal-conflict-replace"));
    await waitFor(() => expect(actions.apply).toHaveBeenLastCalledWith({ draftId, weekStart, overwrite: true }));
  });

  it("keeps Matsedel as it was and says so when saving fails", async () => {
    const user = userEvent.setup();
    const actions = fakeActions({ apply: vi.fn(async () => ({ status: "error" as const, message: "Det gick inte att spara veckan." })) });
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByTestId("proposal-use"));
    expect(await screen.findByText("Det gick inte att spara veckan.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("throws away the draft after a question", async () => {
    const user = userEvent.setup();
    const actions = fakeActions();
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByTestId("proposal-menu"));
    await user.click(screen.getByRole("menuitem", { name: /Släng utkast/ }));
    const question = await screen.findByRole("dialog", { name: "Släng utkastet?" });
    expect(actions.discard).not.toHaveBeenCalled();
    await user.click(within(question).getByRole("button", { name: "Släng utkast" }));
    await waitFor(() => expect(actions.discard).toHaveBeenCalledWith({ draftId }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/matsedel?vecka=2026-W47"));
  });
});

describe("ProposalScreen: starting, waiting and stopping", () => {
  it("starts a proposal when the user asked for one (autoStart) and shows the waiting text first", async () => {
    let resolve: (value: ReturnType<typeof okResult>) => void = () => {};
    const actions = fakeActions({ propose: vi.fn(() => new Promise<ReturnType<typeof okResult>>((r) => (resolve = r))) });
    const onStarted = vi.fn();
    render(screenWith({ autoStart: true, actions, onStarted }).ui);
    expect(screen.getByTestId("week-agent-running")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Avbryt" })).toHaveAttribute("href", "/matsedel?vecka=2026-W47");
    expect(actions.propose).toHaveBeenCalledWith({ weekStart, mode: "plan" });
    expect(onStarted).toHaveBeenCalledTimes(1);
    resolve(okResult());
    expect(await screen.findAllByTestId("proposal-day")).toHaveLength(5);
  });

  it("asks for a redo of a full week with the agent days open (the backend keeps the household's own)", async () => {
    const actions = fakeActions();
    render(screenWith({ autoStart: true, redo: { ownDays: [1, 4] }, actions }).ui);
    await waitFor(() => expect(actions.propose).toHaveBeenCalledWith({ weekStart, mode: "plan", replaceAgentDays: true }));
  });

  it("does not run by itself when it is only visited", () => {
    const actions = fakeActions();
    render(screenWith({ actions }).ui);
    expect(actions.propose).not.toHaveBeenCalled();
    expect(screen.getByTestId("week-agent-nodraft")).toBeInTheDocument();
  });

  it("explains too few recipes and points to Recept and the offer ideas", async () => {
    const actions = fakeActions({ propose: vi.fn(async () => ({ status: "too_few_recipes" as const, needed: 5, available: 3, excludedForAllergy: [] })) });
    render(screenWith({ autoStart: true, actions }).ui);
    const stop = await screen.findByTestId("week-agent-few");
    expect(stop).toHaveTextContent("Du har 3 recept som passar hela hushållet. För ett veckoförslag behövs minst 5.");
    expect(screen.getByTestId("week-agent-add-recipes")).toHaveAttribute("href", "/recept");
    expect(screen.getByRole("link", { name: "Se Nya idéer med erbjudanden" })).toHaveAttribute("href", "/matsedel?vecka=2026-W47");
  });

  it("explains that the AI limit is reached and links to AI-kostnad", async () => {
    const actions = fakeActions({ propose: vi.fn(async () => ({ status: "cap_reached" as const })) });
    render(screenWith({ autoStart: true, actions }).ui);
    const stop = await screen.findByTestId("week-agent-cap");
    expect(stop).toHaveTextContent("AI-taket för idag är nått");
    expect(screen.getByTestId("week-agent-cap-cost")).toHaveAttribute("href", "/installningar/ai-kostnad");
  });

  it("shows an error as text with a way to try again, never an empty screen", async () => {
    const user = userEvent.setup();
    const propose = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(okResult());
    render(screenWith({ autoStart: true, actions: fakeActions({ propose }) }).ui);
    expect(await screen.findByText("Det gick inte att ta fram ett förslag. Försök igen.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findAllByTestId("proposal-day")).toHaveLength(5);
  });

  it("keeps the draft on screen when a re-roll fails", async () => {
    const user = userEvent.setup();
    const actions = fakeActions({ propose: vi.fn(async () => ({ status: "error" as const, message: "AI svarade inte." })) });
    render(screenWith({ initialDraft: draft(), actions }).ui);
    await user.click(screen.getByTestId("proposal-reroll"));
    expect(await screen.findByText("AI svarade inte.")).toBeInTheDocument();
    expect(screen.getAllByTestId("proposal-day")).toHaveLength(5);
  });

  it("says the Tillval is off when it is", () => {
    saveOption("weekAgent", false);
    render(screenWith({ initialDraft: draft() }).ui);
    expect(screen.getByText("Veckoagenten är av. Slå på den under Inställningar, Tillval.")).toBeInTheDocument();
    expect(screen.queryByTestId("proposal-day")).toBeNull();
  });
});
