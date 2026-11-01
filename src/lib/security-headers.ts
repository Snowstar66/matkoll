// Story 17.12: the baseline security headers on every response (next.config.ts).
//
// No script CSP on purpose: with `cacheComponents` the pages are partially
// prerendered, and a nonce CSP needs every page dynamically rendered (Next's
// CSP guide: "Partial Prerendering (PPR) is incompatible with nonce-based
// CSP"); a CSP without nonces would need 'unsafe-inline' for Next's inline
// scripts and add little. The CSP below only closes framing, plugins and
// <base> hijacking, which costs nothing. See docs/molnet.md, "Före vänner", 7.

export const contentSecurityPolicy = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"].join("; ");

/** The camera for Skafferi's and Förråd's photos, from the app itself only; the rest is off. */
export const permissionsPolicy = ["camera=(self)", "microphone=()", "geolocation=()", "payment=()", "usb=()"].join(", ");

export const securityHeaders: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // For browsers without frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
];
