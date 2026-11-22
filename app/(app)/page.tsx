import { Suspense } from "react";
import { Overview } from "../_components/Overview";
import { PageHeader } from "../_components/PageHeader";

export default function OverviewPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Overview" />
          <p className="muted">Loading accounts…</p>
        </>
      }
    >
      <Overview />
    </Suspense>
  );
}
