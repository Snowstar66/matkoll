import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/features/auth";
import { confirmEmailLink } from "@/features/auth/server";

// The magic link lands here (AD-3): /auth/confirm?token_hash=…&type=email&next=/recept.
// It works in any browser because it needs no PKCE verifier from the requesting one.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const next = safeNextPath(params.get("next"));

  const result = tokenHash && params.get("type") === "email" ? await confirmEmailLink(tokenHash) : "invalid";
  if (result === "invalid") {
    redirect(`/logga-in?${new URLSearchParams({ fel: "lank", next })}`);
  }
  if (result === "not_allowed") {
    redirect("/logga-in?fel=atkomst");
  }
  redirect(next);
}
