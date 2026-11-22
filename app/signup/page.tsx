import type { Metadata } from "next";
import { AuthForm } from "../_components/AuthForm";
import { InstanceCard } from "../_components/InstanceCard";

export const metadata: Metadata = { title: "Create owner account · Vault" };

export default function SignUpPage() {
  return (
    <InstanceCard
      title="Create owner account"
      subtitle="You own what you link: each account sees only its own banks and transactions."
    >
      <AuthForm mode="signup" />
    </InstanceCard>
  );
}
