/** Display formatting shared by server and client components. */

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const code = currency ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount);
  } catch {
    // Plaid's unofficial currency codes (e.g. crypto) are not ISO 4217.
    return `${amount.toFixed(2)} ${code}`;
  }
}

/**
 * Plaid amounts are positive when money leaves the account. Flip the sign so
 * the UI reads naturally: spending shows as negative, income as positive.
 */
export function formatTransactionAmount(amount: number, currency: string | null): string {
  const display = -amount;
  const formatted = formatMoney(Math.abs(display), currency);
  return display < 0 ? `−${formatted}` : `+${formatted}`;
}

export function formatCategory(category: string | null): string {
  if (!category) return "";
  return category
    .toLowerCase()
    .split("_")
    .map((word) => (word === "and" ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}
