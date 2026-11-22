import type { Metadata } from "next";
import { AuthForm } from "../_components/AuthForm";

export const metadata: Metadata = { title: "Create account · Vault" };

export default function SignUpPage() {
  return (
    <main className="container auth-page">
      <AuthForm mode="signup" />
    </main>
  );
}
