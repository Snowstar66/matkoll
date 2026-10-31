import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type Result } from "@/lib/errors";
import type { EmailCodeInput, PasswordLoginInput, SignUpInput } from "../domain/login-schema";
import type { SendMagicLinkState } from "../actions/send-magic-link";
import { codeStepStorageKey, LoginForm } from "./login-form";

// LoginForm with both Server Actions stubbed (Story 11.6): after "Skicka
// länk", the field "Kod från mejlet" and "Logga in", for the address the link
// went to, also after a reload in the same tab.

const sendMagicLink = vi.fn<(previous: SendMagicLinkState, formData: FormData) => Promise<SendMagicLinkState>>();
vi.mock("../actions/send-magic-link", () => ({
  sendMagicLink: (previous: SendMagicLinkState, formData: FormData) => sendMagicLink(previous, formData),
}));
const verifyEmailCode = vi.fn<(input: EmailCodeInput) => Promise<Result<never>>>();
vi.mock("../actions/verify-email-code", () => ({
  verifyEmailCode: (input: EmailCodeInput) => verifyEmailCode(input),
}));

const loginWithPassword = vi.fn<(input: PasswordLoginInput) => Promise<Result<never>>>();
vi.mock("../actions/login-with-password", () => ({
  loginWithPassword: (input: PasswordLoginInput) => loginWithPassword(input),
}));
const createAccount = vi.fn<(input: SignUpInput) => Promise<Result<never>>>();
vi.mock("../actions/create-account", () => ({ createAccount: (input: SignUpInput) => createAccount(input) }));
const requestPasswordReset = vi.fn<(input: { email: string; next?: string }) => Promise<Result<null>>>();
vi.mock("../actions/request-password-reset", () => ({
  requestPasswordReset: (input: { email: string; next?: string }) => requestPasswordReset(input),
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
  loginWithPassword.mockReset().mockResolvedValue(fail("auth_password_invalid"));
  createAccount.mockReset().mockResolvedValue(fail("auth_signup_not_allowed"));
  requestPasswordReset.mockReset().mockResolvedValue(ok());
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("has no code field before the link is sent", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: "Skicka länk" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Kod från mejlet")).not.toBeInTheDocument();
  });

  it("signs in with the address, the password and next", async () => {
    render(<LoginForm next="/matsedel" />);
    await userEvent.type(screen.getByLabelText("E-postadress"), "pontus@example.com");
    await userEvent.type(screen.getByLabelText("Lösenord"), "hemligt-lösen");
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));
    expect(loginWithPassword).toHaveBeenCalledWith({
      email: "pontus@example.com",
      password: "hemligt-lösen",
      next: "/matsedel",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("E-postadressen eller lösenordet stämmer inte.");
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it("signs in with Enter in the password field, without sending a link", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("E-postadress"), "pontus@example.com");
    await userEvent.type(screen.getByLabelText("Lösenord"), "hemligt-lösen{Enter}");
    expect(loginWithPassword).toHaveBeenCalledTimes(1);
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it("creates an account and shows the friendly no for an address outside the list", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("E-postadress"), "annan@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Skapa konto" }));
    await userEvent.type(screen.getByLabelText("Lösenord"), "långt-lösenord");
    expect(screen.getByLabelText("Lösenord")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.queryByRole("button", { name: "Skicka länk" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skapa konto" }));
    expect(createAccount).toHaveBeenCalledWith({
      email: "annan@example.com",
      password: "långt-lösenord",
      next: undefined,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Den här adressen är inte inbjuden till Matkoll.");
  });

  it("asks for a reset mail with the address only, and answers the same for everyone", async () => {
    render(<LoginForm next="/recept" />);
    await userEvent.type(screen.getByLabelText("E-postadress"), "pontus@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Glömt lösenord?" }));
    expect(screen.queryByLabelText("Lösenord")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skicka återställningslänk" }));
    expect(requestPasswordReset).toHaveBeenCalledWith({ email: "pontus@example.com", next: "/recept" });
    expect(await screen.findByRole("status")).toHaveTextContent("Om adressen har ett konto skickar vi ett mejl");
    await userEvent.click(screen.getByRole("button", { name: "Tillbaka till inloggning" }));
    expect(screen.getByLabelText("Lösenord")).toBeInTheDocument();
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

  it("freezes the address the link went to, and Byt adress lets it be edited again", async () => {
    render(<LoginForm />);
    await sendLink();
    const email = screen.getByLabelText("E-postadress");
    expect(email).toHaveAttribute("readonly");
    await userEvent.type(email, "x");
    expect(email).toHaveValue("pontus@example.com");

    await userEvent.type(screen.getByLabelText("Kod från mejlet"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));
    expect(verifyEmailCode).toHaveBeenCalledWith(expect.objectContaining({ email: "pontus@example.com" }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Byt adress" }));
    expect(email).not.toHaveAttribute("readonly");
    expect(email).toHaveFocus();
    expect(screen.queryByLabelText("Kod från mejlet")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(codeStepStorageKey)).toBeNull();
  });

  it("clears the old error when the link is sent again", async () => {
    render(<LoginForm />);
    await sendLink();
    await userEvent.type(screen.getByLabelText("Kod från mejlet"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(invalidText);

    await userEvent.click(screen.getByRole("button", { name: "Skicka länk" }));
    await vi.waitFor(() => expect(sendMagicLink).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Kod från mejlet")).toHaveValue("");
  });

  it("comes back to the code step after a reload in the same tab", async () => {
    const { unmount } = render(<LoginForm />);
    await sendLink();
    expect(JSON.parse(sessionStorage.getItem(codeStepStorageKey)!)).toMatchObject({ sent: true, email: "pontus@example.com" });
    unmount();

    render(<LoginForm />);
    expect(await screen.findByLabelText("Kod från mejlet")).toBeInTheDocument();
    expect(screen.getByLabelText("E-postadress")).toHaveValue("pontus@example.com");
    expect(screen.getByRole("status")).toHaveTextContent(sentText);
  });

  it("ignores a stored step older than an hour, and works without sessionStorage", async () => {
    sessionStorage.setItem(
      codeStepStorageKey,
      JSON.stringify({ sent: true, email: "pontus@example.com", at: Date.now() - 61 * 60 * 1000 }),
    );
    render(<LoginForm />);
    expect(screen.queryByLabelText("Kod från mejlet")).not.toBeInTheDocument();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await sendLink();
    expect(screen.getByLabelText("Kod från mejlet")).toBeInTheDocument();
  });

  it("opens the code step without sending with Jag har redan en kod", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Jag har redan en kod" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ange en giltig e-postadress.");
    expect(screen.queryByLabelText("Kod från mejlet")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("E-postadress"), "pontus@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Jag har redan en kod" }));
    expect(screen.getByLabelText("Kod från mejlet")).toBeInTheDocument();
    expect(sendMagicLink).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it.each(["123 456", "123-456", "\uff11\uff12\uff13\uff14\uff15\uff16"])("sends %j on to the server", async (value) => {
    render(<LoginForm />);
    await sendLink();
    await userEvent.type(screen.getByLabelText("Kod från mejlet"), value);
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));
    expect(verifyEmailCode).toHaveBeenCalledWith(expect.objectContaining({ code: value }));
    await screen.findByRole("alert");
  });

  it("shows Supabase's or the app's limit as its own message", async () => {
    verifyEmailCode.mockResolvedValue(fail("auth_code_rate_limited"));
    render(<LoginForm />);
    await sendLink();
    await userEvent.type(screen.getByLabelText("Kod från mejlet"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Logga in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("För många försök. Vänta en stund eller skicka en ny länk.");
  });
});
