import type { NextAuthConfig } from "next-auth";
import { decideAccess, HOME_PATH, SIGN_IN_PATH } from "@/lib/auth/access";

/**
 * Auth.js settings shared by the proxy and the full server config in auth.ts.
 * Kept free of database imports so the proxy bundle stays small; the
 * Credentials provider (which needs Postgres) is added in auth.ts.
 */
export const authConfig = {
  // The Credentials provider only supports JWT sessions: an encrypted,
  // HTTP-only cookie signed with AUTH_SECRET.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: SIGN_IN_PATH },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const access = decideAccess(request.nextUrl.pathname, Boolean(auth?.user?.id));
      switch (access) {
        case "allow":
          return true;
        case "unauthorized":
          return Response.json(
            { error: { code: "unauthorized", message: "Sign in to continue" } },
            { status: 401 },
          );
        case "redirect-home":
          return Response.redirect(new URL(HOME_PATH, request.nextUrl));
        case "redirect-signin":
          return Response.redirect(new URL(SIGN_IN_PATH, request.nextUrl));
      }
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
