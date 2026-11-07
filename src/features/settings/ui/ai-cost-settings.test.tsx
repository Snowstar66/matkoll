import { render as renderBare, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { HouseholdCost } from "../domain/ai-cap";
import { AiCostSettings } from "./ai-cost-settings";

// Inställningar → AI-kostnad with the Server Action stubbed.

const setAiCap = vi.fn<(input: { capSek: number }) => Promise<Result<number>>>();
vi.mock("../actions/set-ai-cap", () => ({ setAiCap: (input: { capSek: number }) => setAiCap(input) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const render = (ui: ReactElement) => renderBare(<ToastProvider>{ui}</ToastProvider>);

const households: HouseholdCost[] = [
  { id: "a", name: "Pontus hem", members: "Pontus", exempt: true, todaySek: 3.5, monthSek: 40, capped: false },
  { id: "b", name: "Annas hem", members: "Anna, Bo", exempt: false, todaySek: 10.2, monthSek: 12, capped: true },
  { id: "c", name: "Cleos hem", members: "Cleo", exempt: false, todaySek: 1, monthSek: 2, capped: false },
];

beforeEach(() => {
  setAiCap.mockReset().mockImplementation(async ({ capSek }) => ok(capSek));
  refresh.mockReset();
});

describe("AiCostSettings", () => {
  it("lists each household with its cost and cap, marks the owner's as Undantaget, and says the figures are estimates", () => {
    render(<AiCostSettings capSek={10} households={households} />);
    const rows = screen.getAllByTestId("ai-cost-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Pontus hem");
    expect(rows[0]).toHaveTextContent("Undantaget");
    expect(rows[1]).toHaveTextContent("Taket är nått");
    expect(rows[2]).toHaveTextContent(/Tak 10,00\s?kr/);
    expect(screen.getByText(/uppskattningar/)).toBeInTheDocument();
  });

  it("saves the cap as kronor with a decimal comma", async () => {
    const user = userEvent.setup();
    render(<AiCostSettings capSek={10} households={households} />);
    const field = screen.getByLabelText(/Tak per hushåll och dag/);
    await user.clear(field);
    await user.type(field, "7,5");
    await user.click(screen.getByRole("button", { name: "Spara" }));
    await waitFor(() => expect(setAiCap).toHaveBeenCalledWith({ capSek: 7.5 }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("refuses a number outside 0 to 1000 without calling the action", async () => {
    const user = userEvent.setup();
    render(<AiCostSettings capSek={10} households={households} />);
    const field = screen.getByLabelText(/Tak per hushåll och dag/);
    await user.clear(field);
    await user.type(field, "5000");
    await user.click(screen.getByRole("button", { name: "Spara" }));
    expect(await screen.findByText(/Skriv ett belopp mellan 0 och 1 000 kr/)).toBeInTheDocument();
    expect(setAiCap).not.toHaveBeenCalled();
  });

  it("shows the action's message when saving fails", async () => {
    setAiCap.mockResolvedValue(fail("ai_cap_save_failed"));
    const user = userEvent.setup();
    render(<AiCostSettings capSek={10} households={households} />);
    await user.click(screen.getByRole("button", { name: "Spara" }));
    expect(await screen.findByText("Det gick inte att spara taket. Försök igen.")).toBeInTheDocument();
  });
});
