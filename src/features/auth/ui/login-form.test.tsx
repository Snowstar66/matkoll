import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { EmailCodeInput } from "../domain/login-schema";
import type { SendMagicLinkState } from "../actions/send-magic-link";
import { LoginForm } from "./login-form";

// LoginForm with both Server Actions stubbed (Story 11.6): after "Skicka
// länk", the field "Kod från mejlet" and "Logga in".

const sendMagicLink = vi.fn<(previous: SendMagicLinkState, formData: FormData) => Promise<SendMagicLinkState>>();
vi.mock("../actions/send-magic-link", () => ({
  sendMagicLink: (previous: SendMagicLinkState, formData: FormData) => sendMagicLink(previous, formData),
}));
const verifyEmailCode = vi.fn<(input: EmailCodeInput) => Promise<Result<never>>>();
vi.mock("../actions/verify-email-code", () => ({
  verifyEmailCode: (input: EmailCodeInput) => verifyEmailCode(input),
}));

const sentText = "Vi har skickat en länk och en kod till din e-post.";
const invalidText = "Koden stämmer inte eller har gått ut. Skicka en ny länk.";

async function sendLink(email = "pontus@example.com") {
  await userEvent.type(screen.getByLabelText("E-postadress"), email);
  await userEvent.click(screen.getByRole("button", { name: "Skicka länk" }));
  await screen.findByText(sentText);
}

beforeEach(() => {
  sendMagicLink.mockReset().mockResolvedValue(ok());
  verifyEmailCode.mockReset().mockResolvedValue(fail("auth_code_invalid"));
});

describe("LoginForm", () => {
  it("has no code field before the link is sent", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: "Skicka länk" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Kod från mejlet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Logga in" })).not.toBeInTheDocument();
  });

  it("asks for the code after the link is sent, and keeps the address", async () => {
    render(<LoginForm next="/matsedel" />);
    await sendLink();

    expect(screen.getByRole("status")).toHaveTextContent(sentText);
    expect(screen.getByLabelText("E-postadress")).toHaveValue("pontus@example.com");
    const code = screen.getByRole("textbox", { name: "Kod från mejlet" });
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("pattern", "[0-9]{6}");
    expect(code).toHaveClass("text-body");
    // One primary button: "Logga in" now, with "Skicka länk" as the secondary.
    expect(screen.getByRole("button", { name: "Skicka länk" })).toHaveClass("bg-sky");
    expect(screen.getByRole("button", { name: "Logga in" })).toHaveClass("bg-accent");
  });

  it("sends the address, the code and next", async () => {
    render(<LoginForm next="/matsedel" />);
    await sendLink();
    await userEvent.type(screen.getByLabelText("Kod från mejlet"), "012345");
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));
    expect(verifyEmailCode).toHaveBeenCalledWith({ email: "pontus@example.com", code: "012345", next: "/matsedel" });
    await screen.findByRole("alert");
  });

  it("shows the error under the field for a refused code, and keeps the field", async () => {
    render(<LoginForm />);
    await sendLink();
    const code = screen.getByLabelText("Kod från mejlet");
    await userEvent.type(code, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(invalidText);
    expect(code).toHaveValue("123456");
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(code).toHaveAccessibleDescription(invalidText);

    // Editing the code hides the answer about the one that was sent.
    await userEvent.type(code, "{Backspace}7");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["12a45", "12345"])("refuses %s without asking the server", async (value) => {
    render(<LoginForm />);
    await sendLink();
    await userEvent.type(screen.getByLabelText("Kod från mejlet"), value);
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(invalidText);
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });
});
