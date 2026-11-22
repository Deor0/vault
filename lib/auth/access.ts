/**
 * Which requests need a session. Used by the proxy (proxy.ts) as a first,
 * optimistic check; route handlers and the dashboard check the session again.
 */

export const SIGN_IN_PATH = "/signin";
export const SIGN_UP_PATH = "/signup";
export const HOME_PATH = "/";

export type Access =
  /** Let the request through. */
  | "allow"
  /** Page request without a session: send to the sign-in page. */
  | "redirect-signin"
  /** API request without a session: respond 401 JSON. */
  | "unauthorized"
  /** Signed in and visiting sign-in or sign-up: go to the dashboard. */
  | "redirect-home";

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function decideAccess(pathname: string, signedIn: boolean): Access {
  // Auth.js endpoints (session, csrf, callback, signout) must stay reachable.
  if (isUnder(pathname, "/api/auth")) return "allow";
  if (isUnder(pathname, SIGN_IN_PATH) || isUnder(pathname, SIGN_UP_PATH)) {
    return signedIn ? "redirect-home" : "allow";
  }
  if (signedIn) return "allow";
  return isUnder(pathname, "/api") ? "unauthorized" : "redirect-signin";
}
