import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";

export type DocRow = {
  doc_id: string;
  name: string | null;
  status: string;
  evm_address: string | null;
  sui_address: string | null;
  ens_name: string | null;
  policy_source: string | null;
  last_user_hash: string | null;
  created_at: number;
  updated_at: number;
};

export type CommandRow = {
  cmd_id: string;
  doc_id: string;
  raw_command: string;
  parsed_json: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  yellow_intent_id: string | null;
  sui_tx_digest: string | null;
  arc_tx_hash: string | null;
  result_text: string | null;
  error_text: string | null;
};

export type DocSettingsRow = {
  doc_id: string;
  quorum: number;
  created_at: number;
  updated_at: number;
};

export type SignerRow = {
  doc_id: string;
  address: string;
  weight: number;
  created_at: number;
  updated_at: number;
};

export type CommandApprovalRow = {
  doc_id: string;
  cmd_id: string;
  signer_address: string;
  decision: string;
  created_at: number;
};

export type YellowSessionRow = {
  doc_id: string;
  app_session_id: string;
  definition_json: string;
  version: number;
  status: string;
  created_at: number;
  updated_at: number;
};

export type YellowSessionKeyRow = {
  doc_id: string;
  signer_address: string;
  session_key_address: string;
  encrypted_session_key_private: string;
  expires_at: number;
  allowances_json: string | null;
  jwt_token: string | null;
  created_at: number;
  updated_at: number;
};

export type CircleWalletRow = {
  doc_id: string;
  wallet_set_id: string | null;
  wallet_id: string;
  wallet_address: string;
  created_at: number;
  updated_at: number;
};

export class Repo {
  private db: Database.Database;

  constructor(dbFile: string) {
    const dir = path.dirname(dbFile);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbFile);
    this.db.exec(SCHEMA_SQL);
  }

  close() {
    this.db.close();
  }

  upsertDoc(params: { docId: string; name?: string }) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO docs(doc_id,name,created_at,updated_at)
         VALUES(?,?,?,?)
         ON CONFLICT(doc_id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`
      )
      .run(params.docId, params.name ?? null, now, now);
  }

  listDocs(): DocRow[] {
    return this.db.prepare(`SELECT * FROM docs ORDER BY updated_at DESC`).all() as DocRow[];
  }

  getDoc(docId: string): DocRow | undefined {
    return this.db.prepare(`SELECT * FROM docs WHERE doc_id=?`).get(docId) as DocRow | undefined;
  }

  setDocLastUserHash(docId: string, hash: string) {
    const now = Date.now();
    this.db.prepare(`UPDATE docs SET last_user_hash=?, updated_at=? WHERE doc_id=?`).run(hash, now, docId);
  }

  setDocAddresses(docId: string, params: { evmAddress: string; suiAddress: string }) {
    const now = Date.now();
    this.db
      .prepare(`UPDATE docs SET evm_address=?, sui_address=?, updated_at=? WHERE doc_id=?`)
      .run(params.evmAddress, params.suiAddress, now, docId);
  }

  setDocPolicy(docId: string, params: { policySource: string; ensName?: string | null }) {
    const now = Date.now();
    this.db
      .prepare(`UPDATE docs SET policy_source=?, ens_name=?, updated_at=? WHERE doc_id=?`)
      .run(params.policySource, params.ensName ?? null, now, docId);
  }

  upsertDocSettings(docId: string, params: { quorum?: number }) {
    const now = Date.now();
    const existing = this.getDocSettings(docId);
    const quorum = params.quorum ?? existing?.quorum ?? 1;
    this.db
      .prepare(
        `INSERT INTO doc_settings(doc_id,quorum,created_at,updated_at)
         VALUES(?,?,?,?)
         ON CONFLICT(doc_id) DO UPDATE SET quorum=excluded.quorum, updated_at=excluded.updated_at`
      )
      .run(docId, quorum, now, now);
  }

  getDocSettings(docId: string): DocSettingsRow | undefined {
    return this.db.prepare(`SELECT * FROM doc_settings WHERE doc_id=?`).get(docId) as DocSettingsRow | undefined;
  }

  getDocQuorum(docId: string): number {
    return this.getDocSettings(docId)?.quorum ?? 1;
  }

  setDocQuorum(docId: string, quorum: number) {
    this.upsertDocSettings(docId, { quorum });
  }

  upsertSigner(params: { docId: string; address: string; weight: number }) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO signers(doc_id,address,weight,created_at,updated_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(doc_id,address) DO UPDATE SET weight=excluded.weight, updated_at=excluded.updated_at`
      )
      .run(params.docId, params.address, params.weight, now, now);
  }

  deleteSigner(params: { docId: string; address: string }) {
    this.db.prepare(`DELETE FROM signers WHERE doc_id=? AND address=?`).run(params.docId, params.address);
  }

  listSigners(docId: string): SignerRow[] {
    return this.db.prepare(`SELECT * FROM signers WHERE doc_id=? ORDER BY weight DESC, updated_at DESC`).all(docId) as SignerRow[];
  }

  recordCommandApproval(params: { docId: string; cmdId: string; signerAddress: string; decision: "APPROVE" | "REJECT" }) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO command_approvals(doc_id,cmd_id,signer_address,decision,created_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(doc_id,cmd_id,signer_address) DO UPDATE SET decision=excluded.decision, created_at=excluded.created_at`
      )
      .run(params.docId, params.cmdId, params.signerAddress, params.decision, now);
  }

  listCommandApprovals(params: { docId: string; cmdId: string }): CommandApprovalRow[] {
    return this.db
      .prepare(`SELECT * FROM command_approvals WHERE doc_id=? AND cmd_id=? ORDER BY created_at ASC`)
      .all(params.docId, params.cmdId) as CommandApprovalRow[];
  }

  clearCommandApprovals(params: { docId: string; cmdId: string }) {
    this.db.prepare(`DELETE FROM command_approvals WHERE doc_id=? AND cmd_id=?`).run(params.docId, params.cmdId);
  }

  upsertYellowSession(params: { docId: string; appSessionId: string; definitionJson: string; version?: number; status?: string }) {
    const now = Date.now();
    const version = params.version ?? this.getYellowSession(params.docId)?.version ?? 0;
    const status = params.status ?? this.getYellowSession(params.docId)?.status ?? "OPEN";
    this.db
      .prepare(
        `INSERT INTO yellow_sessions(doc_id,app_session_id,definition_json,version,status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(doc_id) DO UPDATE SET
           app_session_id=excluded.app_session_id,
           definition_json=excluded.definition_json,
           version=excluded.version,
           status=excluded.status,
           updated_at=excluded.updated_at`
      )
      .run(params.docId, params.appSessionId, params.definitionJson, version, status, now, now);
  }

  getYellowSession(docId: string): YellowSessionRow | undefined {
    return this.db.prepare(`SELECT * FROM yellow_sessions WHERE doc_id=?`).get(docId) as YellowSessionRow | undefined;
  }

  setYellowSessionVersion(params: { docId: string; version: number; status?: string }) {
    const now = Date.now();
    this.db
      .prepare(`UPDATE yellow_sessions SET version=?, status=COALESCE(?, status), updated_at=? WHERE doc_id=?`)
      .run(params.version, params.status ?? null, now, params.docId);
  }

  upsertYellowSessionKey(params: {
    docId: string;
    signerAddress: string;
    sessionKeyAddress: string;
    encryptedSessionKeyPrivate: string;
    expiresAt: number;
    allowancesJson?: string | null;
    jwtToken?: string | null;
  }) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO yellow_session_keys(
          doc_id,signer_address,session_key_address,encrypted_session_key_private,expires_at,allowances_json,jwt_token,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(doc_id,signer_address) DO UPDATE SET
          session_key_address=excluded.session_key_address,
          encrypted_session_key_private=excluded.encrypted_session_key_private,
          expires_at=excluded.expires_at,
          allowances_json=excluded.allowances_json,
          jwt_token=excluded.jwt_token,
          updated_at=excluded.updated_at`
      )
      .run(
        params.docId,
        params.signerAddress,
        params.sessionKeyAddress,
        params.encryptedSessionKeyPrivate,
        params.expiresAt,
        params.allowancesJson ?? null,
        params.jwtToken ?? null,
        now,
        now
      );
  }

  getYellowSessionKey(params: { docId: string; signerAddress: string }): YellowSessionKeyRow | undefined {
    return this.db
      .prepare(`SELECT * FROM yellow_session_keys WHERE doc_id=? AND signer_address=?`)
      .get(params.docId, params.signerAddress) as YellowSessionKeyRow | undefined;
  }

  listYellowSessionKeys(docId: string): YellowSessionKeyRow[] {
    return this.db
      .prepare(`SELECT * FROM yellow_session_keys WHERE doc_id=? ORDER BY updated_at DESC`)
      .all(docId) as YellowSessionKeyRow[];
  }

  upsertCircleWallet(params: { docId: string; walletSetId?: string | null; walletId: string; walletAddress: string }) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO circle_wallets(doc_id,wallet_set_id,wallet_id,wallet_address,created_at,updated_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(doc_id) DO UPDATE SET
           wallet_set_id=excluded.wallet_set_id,
           wallet_id=excluded.wallet_id,
           wallet_address=excluded.wallet_address,
           updated_at=excluded.updated_at`
      )
      .run(params.docId, params.walletSetId ?? null, params.walletId, params.walletAddress, now, now);
  }

  getCircleWallet(docId: string): CircleWalletRow | undefined {
    return this.db.prepare(`SELECT * FROM circle_wallets WHERE doc_id=?`).get(docId) as CircleWalletRow | undefined;
  }

  upsertSecrets(docId: string, encryptedBlob: string) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO secrets(doc_id,encrypted_blob,created_at,updated_at)
         VALUES(?,?,?,?)
         ON CONFLICT(doc_id) DO UPDATE SET encrypted_blob=excluded.encrypted_blob, updated_at=excluded.updated_at`
      )
      .run(docId, encryptedBlob, now, now);
  }

  getSecrets(docId: string): { encrypted_blob: string } | undefined {
    return this.db.prepare(`SELECT encrypted_blob FROM secrets WHERE doc_id=?`).get(docId) as
      | { encrypted_blob: string }
      | undefined;
  }

  insertCommand(cmd: Omit<CommandRow, "created_at" | "updated_at">) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO commands(
          cmd_id,doc_id,raw_command,parsed_json,status,created_at,updated_at,
          yellow_intent_id,sui_tx_digest,arc_tx_hash,result_text,error_text
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        cmd.cmd_id,
        cmd.doc_id,
        cmd.raw_command,
        cmd.parsed_json,
        cmd.status,
        now,
        now,
        cmd.yellow_intent_id,
        cmd.sui_tx_digest,
        cmd.arc_tx_hash,
        cmd.result_text,
        cmd.error_text
      );
  }

  upsertCommand(cmd: Omit<CommandRow, "created_at" | "updated_at">) {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO commands(
          cmd_id,doc_id,raw_command,parsed_json,status,created_at,updated_at,
          yellow_intent_id,sui_tx_digest,arc_tx_hash,result_text,error_text
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(cmd_id) DO UPDATE SET
          raw_command=excluded.raw_command,
          parsed_json=excluded.parsed_json,
          status=excluded.status,
          updated_at=excluded.updated_at,
          yellow_intent_id=COALESCE(excluded.yellow_intent_id, commands.yellow_intent_id),
          sui_tx_digest=COALESCE(excluded.sui_tx_digest, commands.sui_tx_digest),
          arc_tx_hash=COALESCE(excluded.arc_tx_hash, commands.arc_tx_hash),
          result_text=COALESCE(excluded.result_text, commands.result_text),
          error_text=COALESCE(excluded.error_text, commands.error_text)`
      )
      .run(
        cmd.cmd_id,
        cmd.doc_id,
        cmd.raw_command,
        cmd.parsed_json,
        cmd.status,
        now,
        now,
        cmd.yellow_intent_id,
        cmd.sui_tx_digest,
        cmd.arc_tx_hash,
        cmd.result_text,
        cmd.error_text
      );
  }

  getCommand(cmdId: string): CommandRow | undefined {
    return this.db.prepare(`SELECT * FROM commands WHERE cmd_id=?`).get(cmdId) as CommandRow | undefined;
  }

  getNextApprovedCommand(): CommandRow | undefined {
    return this.db
      .prepare(`SELECT * FROM commands WHERE status='APPROVED' ORDER BY created_at ASC LIMIT 1`)
      .get() as CommandRow | undefined;
  }

  setCommandStatus(cmdId: string, status: string, extra?: { resultText?: string | null; errorText?: string | null }) {
    const now = Date.now();
    this.db
      .prepare(`UPDATE commands SET status=?, result_text=COALESCE(?, result_text), error_text=COALESCE(?, error_text), updated_at=? WHERE cmd_id=?`)
      .run(status, extra?.resultText ?? null, extra?.errorText ?? null, now, cmdId);
  }

  setCommandExecutionIds(cmdId: string, params: { yellowIntentId?: string; suiTxDigest?: string; arcTxHash?: string }) {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE commands SET
          yellow_intent_id=COALESCE(?, yellow_intent_id),
          sui_tx_digest=COALESCE(?, sui_tx_digest),
          arc_tx_hash=COALESCE(?, arc_tx_hash),
          updated_at=?
        WHERE cmd_id=?`
      )
      .run(params.yellowIntentId ?? null, params.suiTxDigest ?? null, params.arcTxHash ?? null, now, cmdId);
  }
}
