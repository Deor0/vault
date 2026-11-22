import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsView } from "../../_components/AccountsView";
import { PageHeader } from "../../_components/PageHeader";

export const metadata: Metadata = { title: "Accounts · Vault" };

export default function AccountsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Accounts" />
          <p className="muted">Loading accounts…</p>
        </>
      }
    >
      <AccountsView />
    </Suspense>
  );
}
