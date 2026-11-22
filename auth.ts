import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { verifyCredentials } from "./lib/server/auth/users";
import { getDb } from "./lib/server/context";

/** Auth.js: email + password sign-in against the `users` table. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { type: "email", label: "Email" },
        password: { type: "password", label: "Password" },
      },
      authorize: (credentials) => verifyCredentials(getDb(), credentials),
    }),
  ],
});
