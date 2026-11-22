import { connection } from "next/server";
import { Suspense } from "react";
import { databaseReachable, instanceHost, VAULT_VERSION } from "../_lib/data";

/**
 * The sign-in and sign-up frame: a small card on a grid background, headed by
 * this instance's host, a live status dot, and the version.
 */
export function InstanceCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="instance-card">
        <header className="instance-card-head">
          <span className="wordmark">
            <span className="wordmark-mark" aria-hidden="true" />
            vault
          </span>
          <Suspense fallback={<InstanceLine host="…" state="pending" />}>
            <LiveInstanceLine />
          </Suspense>
        </header>
        <div className="instance-card-body">
          <h1>{title}</h1>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
          {children}
        </div>
      </div>
      <p className="auth-trust">
        Self-hosted · bank tokens encrypted with AES-256-GCM · read-only Plaid access
      </p>
    </main>
  );
}

async function LiveInstanceLine() {
  await connection();
  const [host, dbOk] = await Promise.all([instanceHost(), databaseReachable()]);
  return <InstanceLine host={host} state={dbOk ? "ok" : "down"} />;
}

function InstanceLine({ host, state }: { host: string; state: "ok" | "down" | "pending" }) {
  const label = state === "ok" ? "online" : state === "down" ? "database unreachable" : "checking";
  return (
    <span className="instance-line mono">
      <span className={`status-dot ${state}`} role="img" aria-label={label} title={label} />
      <span className="instance-host">{host}</span>
      <span className="muted">v{VAULT_VERSION}</span>
    </span>
  );
}
