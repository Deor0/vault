import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Gate every page and API route behind a session (see lib/auth/access.ts).
 * This is the first line of defense only: route handlers and the dashboard
 * check the session themselves too.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
