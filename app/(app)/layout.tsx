import Link from "next/link";
import { Suspense } from "react";
import { NavLinks } from "../_components/NavLinks";
import { SidebarStatus, SidebarStatusFallback } from "../_components/SidebarStatus";

/**
 * Signed-in shell: a left sidebar (navigation, institutions with sync status,
 * the signed-in user, and the instance footer) that becomes top tabs on phones.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="wordmark">
          <span className="wordmark-mark" aria-hidden="true" />
          vault
        </Link>
        <NavLinks />
        <div className="sidebar-status">
          <Suspense fallback={<SidebarStatusFallback />}>
            <SidebarStatus />
          </Suspense>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
