import { Suspense } from "react";
import { Dashboard } from "./_components/Dashboard";

export default function Home() {
  return (
    <main className="container">
      <header className="page-header">
        <h1>Vault</h1>
        <p className="muted">Your accounts, balances, and transactions in one place.</p>
      </header>
      <Suspense fallback={<p className="muted">Loading accounts…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
