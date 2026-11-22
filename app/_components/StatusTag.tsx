import type { ItemStatus } from "@/lib/server/repo";

const LABELS: Record<ItemStatus, string> = { active: "ok", login_required: "login required", error: "sync error" };
const COMPACT_LABELS: Record<ItemStatus, string> = { active: "ok", login_required: "login", error: "error" };

/** Sync status of a linked institution (`plaid_items.status`) as a small console tag; the full form names the error code. */
export function StatusTag({
  status,
  errorCode,
  compact = false,
}: {
  status: ItemStatus;
  errorCode?: string | null;
  compact?: boolean;
}) {
  const label = compact ? COMPACT_LABELS[status] : LABELS[status];
  return (
    <span className={`tag tag-${status}`} title={errorCode ?? undefined}>
      {label}
      {!compact && status === "error" && errorCode ? `: ${errorCode}` : null}
    </span>
  );
}
