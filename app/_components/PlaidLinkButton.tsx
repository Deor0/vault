"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccess } from "react-plaid-link";
import { postJson } from "../_lib/api";

interface Props {
  /** When set, open Link in update mode to re-authenticate this existing Item. */
  itemId?: string;
  label: string;
  className?: string;
}

type ExchangeResponse = { status: "linked" } | { status: "duplicate"; existingItemId: string };

/**
 * Fetches a Link token on click, opens Plaid Link, and hands the result to the
 * server. New links exchange the public_token; update mode (`itemId`) keeps
 * the existing Item, so it only tells the server to clear the error and sync.
 */
export function PlaidLinkButton({ itemId, label, className }: Props) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setLinkToken(null);
      setBusy(true);
      try {
        if (itemId) {
          await postJson("/api/plaid/update-complete", { itemId });
          setMessage("Reconnected.");
        } else {
          if (!publicToken) throw new Error("Plaid Link did not return a public token");
          const result = await postJson<ExchangeResponse>("/api/plaid/exchange", {
            publicToken,
            institution: {
              id: metadata.institution?.institution_id ?? null,
              name: metadata.institution?.name ?? null,
            },
          });
          setMessage(
            result.status === "duplicate"
              ? "That login is already linked. Use Reconnect on the existing institution instead."
              : "Account linked.",
          );
        }
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Linking failed");
      } finally {
        setBusy(false);
      }
    },
    [itemId, router],
  );

  const onExit = useCallback<PlaidLinkOnExit>((error) => {
    setLinkToken(null);
    setBusy(false);
    if (error) setMessage(error.display_message ?? error.error_message);
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  // Open Link as soon as the freshly fetched token has loaded.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      const { linkToken: token } = await postJson<{ linkToken: string }>(
        "/api/plaid/link-token",
        itemId ? { itemId } : {},
      );
      setLinkToken(token);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Could not start Plaid Link");
    }
  }

  return (
    <span className="link-action">
      <button type="button" className={className ?? "button primary"} onClick={start} disabled={busy}>
        {busy ? "Working…" : label}
      </button>
      {message ? (
        <span className="hint" role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}
