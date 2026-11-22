import type { Metadata } from "next";
import { AuthForm } from "../_components/AuthForm";
import { InstanceCard } from "../_components/InstanceCard";

export const metadata: Metadata = { title: "Sign in · Vault" };

export default function SignInPage() {
  return (
    <InstanceCard title="Sign in" subtitle="Use the email and password for your account on this instance.">
      <AuthForm mode="signin" />
    </InstanceCard>
  );
}
