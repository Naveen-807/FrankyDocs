export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS docs (
  doc_id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'TRACKED',
  evm_address TEXT,
  sui_address TEXT,
  ens_name TEXT,
  policy_source TEXT,
  last_user_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS secrets (
  doc_id TEXT PRIMARY KEY,
  encrypted_blob TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS commands (
  cmd_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  raw_command TEXT NOT NULL,
  parsed_json TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  yellow_intent_id TEXT,
  sui_tx_digest TEXT,
  arc_tx_hash TEXT,
  result_text TEXT,
  error_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_commands_doc_status_created ON commands(doc_id, status, created_at);

CREATE TABLE IF NOT EXISTS doc_settings (
  doc_id TEXT PRIMARY KEY,
  quorum INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signers (
  doc_id TEXT NOT NULL,
  address TEXT NOT NULL,
  weight INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, address)
);

CREATE TABLE IF NOT EXISTS command_approvals (
  doc_id TEXT NOT NULL,
  cmd_id TEXT NOT NULL,
  signer_address TEXT NOT NULL,
  decision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, cmd_id, signer_address)
);

CREATE TABLE IF NOT EXISTS yellow_sessions (
  doc_id TEXT PRIMARY KEY,
  app_session_id TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS yellow_session_keys (
  doc_id TEXT NOT NULL,
  signer_address TEXT NOT NULL,
  session_key_address TEXT NOT NULL,
  encrypted_session_key_private TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  allowances_json TEXT,
  jwt_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, signer_address)
);

CREATE TABLE IF NOT EXISTS circle_wallets (
  doc_id TEXT PRIMARY KEY,
  wallet_set_id TEXT,
  wallet_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
