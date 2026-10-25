// Client-safe entry: types and domain.
export type { User } from "./domain/user";
export { isAllowedEmail, normalizeEmail } from "./domain/allowed-email";
export { defaultNextPath, safeNextPath } from "./domain/safe-next-path";
export { loginFieldErrors, loginSchema, type LoginInput } from "./domain/login-schema";
