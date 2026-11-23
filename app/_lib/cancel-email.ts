import { formatMoney, formatShortDate } from "./format";

/** A cancellation request the user can paste into an email or a support chat. Vault never sends it. */
export function cancellationEmail(subscription: {
  name: string;
  lastAmount: number;
  lastDate: string;
  currency: string | null;
  accountMask: string | null;
}): { subject: string; body: string } {
  const card = subscription.accountMask ? ` to my card or account ending in ${subscription.accountMask}` : "";
  return {
    subject: `Cancel my ${subscription.name} subscription`,
    body: [
      "Hello,",
      "",
      `Please cancel my ${subscription.name} subscription effective immediately and stop all future charges.`,
      `The most recent charge was ${formatMoney(subscription.lastAmount, subscription.currency)} on ${formatShortDate(subscription.lastDate)}${card}.`,
      "",
      "Please confirm the cancellation in writing by replying to this email, including the date it takes effect.",
      "",
      "Thank you,",
      "[Your name]",
      "[The email address or account number on the subscription]",
    ].join("\n"),
  };
}
