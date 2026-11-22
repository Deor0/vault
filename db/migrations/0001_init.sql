-- Vault initial schema: linked Plaid Items, their accounts, and transactions.

CREATE TABLE plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id text NOT NULL UNIQUE,
  -- AES-256-GCM ciphertext (see lib/server/crypto.ts); never the raw token.
  access_token_ciphertext text NOT NULL,
  institution_id text,
  institution_name text,
  -- 'login_required' means the Item needs update-mode Link to re-authenticate.
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'login_required', 'error')),
  error_code text,
  -- /transactions/sync cursor; NULL until the first successful sync.
  transactions_cursor text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES plaid_items (id) ON DELETE CASCADE,
  plaid_account_id text NOT NULL UNIQUE,
  name text NOT NULL,
  official_name text,
  mask text,
  type text NOT NULL,
  subtype text,
  current_balance numeric(20, 4),
  available_balance numeric(20, 4),
  credit_limit numeric(20, 4),
  iso_currency_code text,
  unofficial_currency_code text,
  balances_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX accounts_item_id_idx ON accounts (item_id);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES plaid_items (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  plaid_transaction_id text NOT NULL UNIQUE,
  -- Plaid convention: positive = money out of the account, negative = money in.
  amount numeric(20, 4) NOT NULL,
  iso_currency_code text,
  unofficial_currency_code text,
  date date NOT NULL,
  authorized_date date,
  name text NOT NULL,
  merchant_name text,
  category_primary text,
  category_detailed text,
  payment_channel text,
  pending boolean NOT NULL DEFAULT false,
  pending_transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactions_date_idx ON transactions (date DESC, created_at DESC);
CREATE INDEX transactions_account_id_idx ON transactions (account_id);
CREATE INDEX transactions_item_id_idx ON transactions (item_id);
