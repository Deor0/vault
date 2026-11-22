import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "../../_components/PageHeader";
import { SubscriptionsView } from "../../_components/SubscriptionsView";

export const metadata: Metadata = { title: "Subscriptions · Vault" };

export default function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Subscriptions" />
          <p className="muted">Finding recurring charges…</p>
        </>
      }
    >
      <SubscriptionsView searchParams={searchParams} />
    </Suspense>
  );
}
