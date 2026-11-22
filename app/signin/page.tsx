import type { Metadata } from "next";
import { AuthForm } from "../_components/AuthForm";

export const metadata: Metadata = { title: "Sign in · Vault" };

export default function SignInPage() {
  return (
    <main className="container auth-page">
      <AuthForm mode="signin" />
    </main>
  );
}
