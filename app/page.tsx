import { Suspense } from "react";
import { Dashboard } from "./_components/Dashboard";
import { UserMenu } from "./_components/UserMenu";

export default function Home() {
  return (
    <main className="container">
      <header className="page-header">
        <div>
          <h1>Vault</h1>
          <p className="muted">Your accounts, balances, and transactions in one place.</p>
        </div>
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </header>
      <Suspense fallback={<p className="muted">Loading accounts…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
