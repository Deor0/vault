-- Subscriptions: richer merchant data on transactions, and the user's decisions
-- about each recurring charge Vault detects (lib/server/subscriptions.ts).

-- Plaid sends these on every /transactions/sync row. merchant_entity_id is a
-- stable merchant id (the best way to group a merchant's charges); website and
-- logo_url help link to the merchant. Rows synced before this migration keep
-- NULL until Plaid sends them again.
ALTER TABLE transactions
  ADD COLUMN merchant_entity_id text,
  ADD COLUMN website text,
  ADD COLUMN logo_url text;

-- One row per recurring charge the user has made a decision about. stream_key
-- is the detector's id for the charge (a merchant id or a normalized merchant
-- name, plus an amount band when one merchant bills two plans). Streams with no
-- row here are shown as detected.
CREATE TABLE subscription_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stream_key text NOT NULL CHECK (stream_key <> ''),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'ignored', 'cancelled')),
  -- NULL keeps the detected kind.
  kind text CHECK (kind IN ('subscription', 'bill')),
  display_name text,
  -- Set when the user marks the charge cancelled; any later charge is flagged.
  cancelled_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, stream_key),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
