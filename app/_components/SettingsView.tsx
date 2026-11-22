import { connection } from "next/server";
import { auth } from "@/auth";
import { databaseReachable, instanceHost, VAULT_VERSION } from "../_lib/data";
import { signOutAction } from "../_lib/auth-actions";
import { plaidSetup } from "../_lib/setup";

/** The signed-in user and Sign out. */
export async function AccountSettings() {
  await connection();
  const session = await auth();
  return (
    <dl className="settings-list">
      <div>
        <dt>Signed in as</dt>
        <dd>{session?.user?.email ?? "—"}</dd>
      </div>
      {session?.user?.name ? (
        <div>
          <dt>Name</dt>
          <dd>{session.user.name}</dd>
        </div>
      ) : null}
      <div>
        <dt>Session</dt>
        <dd>
          <form action={signOutAction}>
            <button type="submit" className="button">
              Sign out
            </button>
          </form>
        </dd>
      </div>
    </dl>
  );
}

/** What this instance is running against. Never shows secrets. */
export async function InstanceSettings() {
  await connection();
  const [host, dbOk] = await Promise.all([instanceHost(), databaseReachable()]);
  const plaid = plaidSetup();
  return (
    <dl className="settings-list">
      <div>
        <dt>Host</dt>
        <dd className="mono">{host}</dd>
      </div>
      <div>
        <dt>Version</dt>
        <dd className="mono">v{VAULT_VERSION}</dd>
      </div>
      <div>
        <dt>Database</dt>
        <dd className="mono">
          <span className={dbOk ? "ok" : "bad"}>{dbOk ? "reachable" : "unreachable"}</span>
        </dd>
      </div>
      <div>
        <dt>Plaid</dt>
        <dd className="mono">{plaid.configured ? plaid.env : "keys not configured"}</dd>
      </div>
    </dl>
  );
}
