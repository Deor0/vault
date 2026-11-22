import Link from "next/link";
import type { DashboardItem } from "@/lib/server/dashboard";
import { instanceHost, loadItems, requirePageUserId, VAULT_VERSION } from "../_lib/data";
import { plaidSetup } from "../_lib/setup";
import { StatusTag } from "./StatusTag";
import { UserMenu } from "./UserMenu";

/**
 * The data-driven half of the sidebar: linked institutions with their sync
 * status, the signed-in user, and the instance footer (host, version, database, Plaid environment).
 */
export async function SidebarStatus() {
  const userId = await requirePageUserId();
  let items: DashboardItem[] | null = null;
  try {
    items = await loadItems(userId);
  } catch {
    // The page itself shows the setup notice; here the footer just reports the database as down.
  }
  const host = await instanceHost();
  const plaid = plaidSetup();

  return (
    <>
      <section className="sidebar-section sidebar-institutions" aria-label="Institutions">
        <h2 className="sidebar-heading">Institutions</h2>
        {items && items.length > 0 ? (
          <ul className="institution-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={`/accounts#item-${item.id}`} className="institution-link">
                  <span className="institution-name">{item.institutionName ?? "Linked institution"}</span>
                  <StatusTag status={item.status} errorCode={item.errorCode} compact />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sidebar-empty">{items ? "None linked yet" : "Unavailable"}</p>
        )}
      </section>
      <UserMenu />
      <InstanceFooter host={host} dbOk={items !== null} plaidEnv={plaid.configured ? plaid.env : "not configured"} />
    </>
  );
}

function InstanceFooter({ host, dbOk, plaidEnv }: { host: string; dbOk: boolean; plaidEnv: string }) {
  return (
    <footer className="instance-footer">
      <span className="instance-host" title={host}>
        {host}
      </span>
      <span>
        v{VAULT_VERSION} · <span className={dbOk ? "ok" : "bad"}>pg {dbOk ? "ok" : "down"}</span>
      </span>
      <span>plaid {plaidEnv}</span>
    </footer>
  );
}

/** Placeholder with the same shape while the sidebar's data streams in. */
export function SidebarStatusFallback() {
  return (
    <>
      <section className="sidebar-section sidebar-institutions" aria-label="Institutions">
        <h2 className="sidebar-heading">Institutions</h2>
        <p className="sidebar-empty">Loading…</p>
      </section>
      <footer className="instance-footer">
        <span className="instance-host">&nbsp;</span>
        <span>v{VAULT_VERSION}</span>
      </footer>
    </>
  );
}
