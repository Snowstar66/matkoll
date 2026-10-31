import { describe, expect, it } from "vitest";
import {
  emailCodeSchema,
  loginFieldErrors,
  loginSchema,
  newPasswordSchema,
  normalizeEmailCode,
  passwordLoginSchema,
} from "./login-schema";

describe("loginSchema", () => {
  it("accepts and trims a valid address", () => {
    expect(loginSchema.parse({ email: " pontus@example.com " }).email).toBe("pontus@example.com");
  });

  it.each(["inte-en-adress", "", "pontus@", undefined])("rejects %s with the Swedish message", (email) => {
    const result = loginSchema.safeParse({ email });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(loginFieldErrors(result.error)).toEqual({ email: "Ange en giltig e-postadress." });
    }
  });

  it("keeps a next of up to 512 characters and drops a longer one", () => {
    const kept = `/${"a".repeat(511)}`;
    expect(loginSchema.parse({ email: "pontus@example.com", next: kept }).next).toBe(kept);
    const parsed = loginSchema.safeParse({ email: "pontus@example.com", next: `/${"a".repeat(512)}` });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.next).toBeUndefined();
  });
});

describe("normalizeEmailCode", () => {
  it.each([
    ["012345", "012345"],
    [" 012345 ", "012345"],
    ["123 456", "123456"],
    ["123-456", "123456"],
    ["123\u2013456", "123456"],
    ["\uff11\uff12\uff13\uff14\uff15\uff16", "123456"],
    ["12\u00a034\u202f56", "123456"],
  ])("turns %j into %j", (code, expected) => {
    expect(normalizeEmailCode(code)).toBe(expected);
  });
});

describe("emailCodeSchema", () => {
  it.each(["012345", " 012345 ", "123 456", "123-456", "\uff11\uff12\uff13\uff14\uff15\uff16"])(
    "accepts %j as six digits",
    (code) => {
      expect(emailCodeSchema.parse({ email: "pontus@example.com", code }).code).toMatch(/^[0-9]{6}$/);
    },
  );

  it.each(["12a45", "12345", "1234567", "", "\u0661\u0662\u0663\u0664\u0665\u0666", "12.3456", undefined])(
    "refuses the code %j",
    (code) => {
      expect(emailCodeSchema.safeParse({ email: "pontus@example.com", code }).success).toBe(false);
    },
  );

  it("refuses an invalid address", () => {
    expect(emailCodeSchema.safeParse({ email: "inte-en-adress", code: "123456" }).success).toBe(false);
  });
});

describe("passwordLoginSchema", () => {
  it("accepts any non-empty password, however short", () => {
    expect(passwordLoginSchema.safeParse({ email: " a@b.se ", password: "x" }).success).toBe(true);
  });

  it("refuses an empty password and an invalid address", () => {
    expect(passwordLoginSchema.safeParse({ email: "a@b.se", password: "" }).success).toBe(false);
    expect(passwordLoginSchema.safeParse({ email: "a", password: "x" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("needs at least 12 characters, in Swedish", () => {
    const result = newPasswordSchema.safeParse("elvatecken");
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe("Lösenordet måste vara minst 12 tecken.");
    expect(newPasswordSchema.safeParse("123456789012").success).toBe(true);
  });

  it("stops at 72 bytes, not 72 characters", () => {
    expect(newPasswordSchema.safeParse("x".repeat(72)).success).toBe(true);
    expect(newPasswordSchema.safeParse("x".repeat(73)).success).toBe(false);
    // 40 two-byte letters are 40 characters but 80 bytes.
    expect(newPasswordSchema.safeParse("å".repeat(40)).success).toBe(false);
    expect(newPasswordSchema.safeParse("å".repeat(36)).success).toBe(true);
    expect(passwordLoginSchema.safeParse({ email: "a@b.se", password: "å".repeat(40) }).success).toBe(false);
  });
});
