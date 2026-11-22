import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "../../_components/PageHeader";
import { TransactionsView } from "../../_components/TransactionsView";

export const metadata: Metadata = { title: "Transactions · Vault" };

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Transactions" />
          <p className="muted">Loading transactions…</p>
        </>
      }
    >
      <TransactionsView />
    </Suspense>
  );
}
