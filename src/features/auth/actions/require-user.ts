import "server-only";
import { redirect } from "next/navigation";
import { fail, ok, type Result } from "@/lib/errors";
import { getCurrentUser } from "../data/queries";
import type { User } from "../domain/user";

// The authoritative access check (AD-3). Not a Server Action: these are helpers
// that actions, pages and Route Handlers call first.

/** For Server Actions: the user, or `unauthorized`. */
export async function requireUser(): Promise<Result<User>> {
  const user = await getCurrentUser();
  return user ? ok(user) : fail("unauthorized");
}

/** For pages, inside <Suspense>: the user, or a redirect to the login page. */
export async function requireUserOrRedirect(next: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/logga-in?${new URLSearchParams({ next })}`);
  }
  return user;
}

/** For Route Handlers: the user, or a 401 response with the `unauthorized` result. */
export async function requireUserForRoute(): Promise<
  { user: User; response?: never } | { user?: never; response: Response }
> {
  const user = await getCurrentUser();
  if (user) return { user };
  return { response: Response.json(fail("unauthorized"), { status: 401 }) };
}
