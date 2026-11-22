"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "../_lib/api";

type SyncResult =
  | { status: "synced"; added: number; modified: number; removed: number }
  | { status: "login_required" | "conflict" | "error" };

/** Manually re-sync balances and transactions for every linked Item. */
export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const { results } = await postJson<{ results: SyncResult[] }>("/api/sync", {});
      setMessage(summarize(results));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="link-action">
      <button type="button" className="button" onClick={refresh} disabled={busy}>
        {busy ? "Refreshing…" : "Refresh"}
      </button>
      {message ? (
        <span className="hint" role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}

function summarize(results: SyncResult[]): string {
  if (results.length === 0) return "Nothing linked yet.";
  let added = 0;
  let modified = 0;
  let removed = 0;
  let needsAttention = 0;
  for (const result of results) {
    if (result.status === "synced") {
      added += result.added;
      modified += result.modified;
      removed += result.removed;
    } else if (result.status !== "conflict") {
      needsAttention += 1;
    }
  }
  const parts = [`${added} new, ${modified} updated, ${removed} removed`];
  if (needsAttention > 0) parts.push(`${needsAttention} need attention`);
  return `Synced: ${parts.join("; ")}.`;
}
