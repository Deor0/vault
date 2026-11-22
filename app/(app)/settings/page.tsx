import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "../../_components/PageHeader";
import { AccountSettings, InstanceSettings } from "../../_components/SettingsView";
import { ThemeSwitcher } from "../../_components/ThemeSwitcher";

export const metadata: Metadata = { title: "Settings · Vault" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <section className="panel settings-section">
        <h2>Appearance</h2>
        <p className="muted">Dark is the default. The choice is saved in this browser.</p>
        <ThemeSwitcher />
      </section>
      <section className="panel settings-section">
        <h2>Account</h2>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <AccountSettings />
        </Suspense>
      </section>
      <section className="panel settings-section">
        <h2>Instance</h2>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <InstanceSettings />
        </Suspense>
      </section>
    </>
  );
}
