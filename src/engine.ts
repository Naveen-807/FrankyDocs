import type { docs_v1, drive_v3 } from "googleapis";
import { parseCommand } from "./core/commands.js";
import type { ParsedCommand } from "./core/commands.js";
import { evaluatePolicy } from "./core/policy.js";
import { sha256Hex } from "./util/hash.js";
import { Repo } from "./db/repo.js";
import { listAccessibleDocs } from "./google/drive.js";
import {
  appendAuditRow,
  appendRecentActivityRow,
  loadDocWalletTables,
  readCommandsTable,
  readConfig,
  updateCommandsRowCells,
  userEditableCommandsHash,
  writeConfigValue
} from "./google/docwallet.js";
import { createAndStoreDocSecrets, loadDocSecrets } from "./wallet/store.js";
import { decryptWithMasterKey } from "./wallet/crypto.js";
import type { AppConfig } from "./config.js";
import { ArcClient } from "./integrations/arc.js";
import { CircleArcClient } from "./integrations/circle.js";
import { EnsPolicyClient } from "./integrations/ens.js";
import { NitroRpcYellowClient } from "./integrations/yellow.js";
import type { DeepBookClient } from "./integrations/deepbook.js";

type ExecutionContext = {
  config: AppConfig;
  docs: docs_v1.Docs;
  drive: drive_v3.Drive;
  repo: Repo;
  yellow?: NitroRpcYellowClient;
  deepbook?: DeepBookClient;
  arc?: ArcClient;
  circle?: CircleArcClient;
  ens?: EnsPolicyClient;
};

export class Engine {
  private discoveryRunning = false;
  private pollRunning = false;
  private executorRunning = false;

  constructor(private ctx: ExecutionContext) {}

  async discoveryTick() {
    if (this.discoveryRunning) return;
    this.discoveryRunning = true;
    try {
      const { config, drive, docs, repo } = this.ctx;
      if (config.DOCWALLET_DOC_ID) {
        const d = await docs.documents.get({ documentId: config.DOCWALLET_DOC_ID });
        const title = d.data.title ?? config.DOCWALLET_DOC_ID;
        repo.upsertDoc({ docId: config.DOCWALLET_DOC_ID, name: title });
        await loadDocWalletTables({ docs, docId: config.DOCWALLET_DOC_ID });
        return;
      }

      const files = await listAccessibleDocs({
        drive,
        namePrefix: config.DOCWALLET_DISCOVER_ALL ? undefined : config.DOCWALLET_NAME_PREFIX
      });
      for (const f of files) {
        repo.upsertDoc({ docId: f.id, name: f.name });
        await loadDocWalletTables({ docs, docId: f.id });
      }
    } finally {
      this.discoveryRunning = false;
    }
  }

  async pollTick() {
    if (this.pollRunning) return;
    this.pollRunning = true;
    try {
      const { docs, repo, config } = this.ctx;
      const tracked = repo.listDocs();
      for (const d of tracked) {
        const docId = d.doc_id;
        const tables = await loadDocWalletTables({ docs, docId });
        const configMap = readConfig(tables.config.table);
        const ensName = configMap["ENS_NAME"]?.value?.trim() || d.ens_name || "";

        const publicBaseUrl = config.PUBLIC_BASE_URL ?? `http://localhost:${config.HTTP_PORT}`;

        // Treat Config table as source of truth for quorum (so the doc can be edited without a command).
        const qText = configMap["QUORUM"]?.value?.trim() ?? "";
        const qNum = qText ? Number(qText) : NaN;
        if (Number.isFinite(qNum) && qNum > 0 && Math.floor(qNum) === qNum && repo.getDocQuorum(docId) !== qNum) {
          repo.setDocQuorum(docId, qNum);
        }

        // Best-effort sync some config rows so the doc is "judge-ready".
        try {
          if (configMap["DOC_ID"] && configMap["DOC_ID"].value !== docId) {
            await writeConfigValue({ docs, docId, configTable: tables.config.table, key: "DOC_ID", value: docId });
          }
          if (configMap["WEB_BASE_URL"] && configMap["WEB_BASE_URL"].value !== publicBaseUrl) {
            await writeConfigValue({ docs, docId, configTable: tables.config.table, key: "WEB_BASE_URL", value: publicBaseUrl });
          }
          if (configMap["JOIN_URL"]) {
            const joinUrl = `${publicBaseUrl}/join/${encodeURIComponent(docId)}`;
            if (configMap["JOIN_URL"].value !== joinUrl) {
              await writeConfigValue({ docs, docId, configTable: tables.config.table, key: "JOIN_URL", value: joinUrl });
            }
          }
          if (configMap["QUORUM"]) {
            const q = repo.getDocQuorum(docId);
            if (configMap["QUORUM"].value !== String(q)) {
              await writeConfigValue({ docs, docId, configTable: tables.config.table, key: "QUORUM", value: String(q) });
            }
          }
          if (configMap["SIGNERS"]) {
            const signers = repo.listSigners(docId).map((s) => s.address).join(",");
            if (configMap["SIGNERS"].value !== signers) {
              await writeConfigValue({ docs, docId, configTable: tables.config.table, key: "SIGNERS", value: signers });
            }
          }
        } catch {
          // ignore
        }

        const commandsHash = sha256Hex(userEditableCommandsHash(tables.commands.table));
        if (d.last_user_hash && d.last_user_hash === commandsHash) continue;

        const rows = readCommandsTable(tables.commands.table);
        for (const row of rows) {
          if (!row.command) continue;
          if (!row.command.toUpperCase().startsWith("DW")) continue;

          if (!row.id) {
            const cmdId = generateCmdId(docId, row.command);
            const parsed = parseCommand(row.command);
            if (!parsed.ok) {
              repo.upsertCommand({
                cmd_id: cmdId,
                doc_id: docId,
                raw_command: row.command,
                parsed_json: null,
                status: "INVALID",
                yellow_intent_id: null,
                sui_tx_digest: null,
                arc_tx_hash: null,
                result_text: null,
                error_text: parsed.error
              });
              await this.updateRowByIndex(docId, row.rowIndex, { id: cmdId, status: "INVALID", error: parsed.error, approvalUrl: "" });
              await this.audit(docId, `${cmdId} INVALID (${parsed.error})`);
              continue;
            }

            const policyDecision = await this.checkPolicyIfPresent(ensName, parsed.value);
            if (!policyDecision.ok) {
              repo.upsertCommand({
                cmd_id: cmdId,
                doc_id: docId,
                raw_command: row.command,
                parsed_json: JSON.stringify(parsed.value),
                status: "REJECTED_POLICY",
                yellow_intent_id: null,
                sui_tx_digest: null,
                arc_tx_hash: null,
                result_text: null,
                error_text: policyDecision.reason
              });
              await updateCommandsRowCells({
                docs,
                docId,
                commandsTable: (await loadDocWalletTables({ docs, docId })).commands.table,
                rowIndex: row.rowIndex,
                updates: { id: cmdId, status: "REJECTED_POLICY", error: policyDecision.reason, approvalUrl: "" }
              });
              await this.audit(docId, `${cmdId} REJECTED_POLICY (${policyDecision.reason})`);
              continue;
            }

            const initialStatus = parsed.value.type === "SETUP" ? "APPROVED" : "PENDING_APPROVAL";
            repo.upsertCommand({
              cmd_id: cmdId,
              doc_id: docId,
              raw_command: row.command,
              parsed_json: JSON.stringify(parsed.value),
              status: initialStatus,
              yellow_intent_id: null,
              sui_tx_digest: null,
              arc_tx_hash: null,
              result_text: null,
              error_text: null
            });

            const approvalUrl = initialStatus === "PENDING_APPROVAL" ? `${publicBaseUrl}/cmd/${encodeURIComponent(docId)}/${encodeURIComponent(cmdId)}` : "";
            await this.updateRowByIndex(docId, row.rowIndex, { id: cmdId, status: initialStatus, approvalUrl, error: "" });
            await this.audit(docId, `${cmdId} ${initialStatus}`);
            continue;
          }

          // Existing row: edits / best-effort backfill
          const existing = repo.getCommand(row.id);
          if (!existing) {
            // Best effort: ingest it.
            const parsed = parseCommand(row.command);
            repo.upsertCommand({
              cmd_id: row.id,
              doc_id: docId,
              raw_command: row.command,
              parsed_json: parsed.ok ? JSON.stringify(parsed.value) : null,
              status: parsed.ok && parsed.value.type === "SETUP" ? "APPROVED" : parsed.ok ? "PENDING_APPROVAL" : "INVALID",
              yellow_intent_id: null,
              sui_tx_digest: null,
              arc_tx_hash: null,
              result_text: null,
              error_text: parsed.ok ? null : parsed.error
            });
          } else if (existing.raw_command !== row.command) {
            if (existing.status === "PENDING_APPROVAL" || existing.status === "INVALID") {
              const parsed = parseCommand(row.command);
              if (!parsed.ok) {
                repo.upsertCommand({
                  cmd_id: existing.cmd_id,
                  doc_id: existing.doc_id,
                  raw_command: row.command,
                  parsed_json: null,
                  status: "INVALID",
                  yellow_intent_id: existing.yellow_intent_id,
                  sui_tx_digest: existing.sui_tx_digest,
                  arc_tx_hash: existing.arc_tx_hash,
                  result_text: existing.result_text,
                  error_text: parsed.error
                });
                await updateCommandsRowCells({
                  docs,
                  docId,
                  commandsTable: (await loadDocWalletTables({ docs, docId })).commands.table,
                  rowIndex: row.rowIndex,
                  updates: { status: "INVALID", error: parsed.error }
                });
              } else {
                const newStatus =
                  parsed.value.type === "SETUP" ? "APPROVED" : "PENDING_APPROVAL";
                repo.upsertCommand({
                  cmd_id: existing.cmd_id,
                  doc_id: existing.doc_id,
                  raw_command: row.command,
                  parsed_json: JSON.stringify(parsed.value),
                  status: newStatus,
                  yellow_intent_id: existing.yellow_intent_id,
                  sui_tx_digest: existing.sui_tx_digest,
                  arc_tx_hash: existing.arc_tx_hash,
                  result_text: existing.result_text,
                  error_text: null
                });
                const approvalUrl =
                  newStatus === "PENDING_APPROVAL"
                    ? `${publicBaseUrl}/cmd/${encodeURIComponent(docId)}/${encodeURIComponent(existing.cmd_id)}`
                    : "";
                await updateCommandsRowCells({
                  docs,
                  docId,
                  commandsTable: (await loadDocWalletTables({ docs, docId })).commands.table,
                  rowIndex: row.rowIndex,
                  updates: { status: newStatus, approvalUrl, error: "" }
                });
              }
            } else {
              await updateCommandsRowCells({
                docs,
                docId,
                commandsTable: (await loadDocWalletTables({ docs, docId })).commands.table,
                rowIndex: row.rowIndex,
                updates: { error: "Command locked after approval/execution" }
              });
            }
          }

          // If still pending approval, ensure the approval URL is present (covers older template migrations).
          const cmd = repo.getCommand(row.id);
          if (cmd?.status === "PENDING_APPROVAL" && !row.approvalUrl) {
            await updateCommandsRowCells({
              docs,
              docId,
              commandsTable: (await loadDocWalletTables({ docs, docId })).commands.table,
              rowIndex: row.rowIndex,
              updates: { approvalUrl: `${publicBaseUrl}/cmd/${encodeURIComponent(docId)}/${encodeURIComponent(row.id)}` }
            });
          }
        }

        repo.setDocLastUserHash(docId, commandsHash);

        // Best-effort ensure config points to ENS if set.
        if (ensName && configMap["POLICY_SOURCE"]?.value !== "ENS") {
          repo.setDocPolicy(docId, { policySource: "ENS", ensName });
        }
      }
    } finally {
      this.pollRunning = false;
    }
  }

  async executorTick() {
    if (this.executorRunning) return;
    this.executorRunning = true;
    let executing: { docId: string; cmdId: string } | null = null;
    try {
      const { repo } = this.ctx;
      const cmd = repo.getNextApprovedCommand();
      if (!cmd) return;
      executing = { docId: cmd.doc_id, cmdId: cmd.cmd_id };
      repo.setCommandStatus(cmd.cmd_id, "EXECUTING", { errorText: null });

      await this.updateDocRow(cmd.doc_id, cmd.cmd_id, { status: "EXECUTING", error: "" });
      await this.audit(cmd.doc_id, `${cmd.cmd_id} EXECUTING`);

      const command: ParsedCommand = cmd.parsed_json
        ? (JSON.parse(cmd.parsed_json) as ParsedCommand)
        : (() => {
            const pr = parseCommand(cmd.raw_command);
            if (!pr.ok) throw new Error(`Cannot execute invalid command: ${pr.error}`);
            return pr.value;
          })();

      const result = await this.execute(cmd.doc_id, cmd.cmd_id, command);
      repo.setCommandExecutionIds(cmd.cmd_id, {
        suiTxDigest: result.suiTxDigest,
        arcTxHash: result.arcTxHash
      });
      repo.setCommandStatus(cmd.cmd_id, "EXECUTED", { resultText: result.resultText, errorText: null });

      await this.updateDocRow(cmd.doc_id, cmd.cmd_id, { status: "EXECUTED", result: result.resultText, error: "" });
      await this.audit(cmd.doc_id, `${cmd.cmd_id} EXECUTED ${result.resultText}`);

      await appendRecentActivityRow({
        docs: this.ctx.docs,
        docId: cmd.doc_id,
        timestampIso: new Date().toISOString(),
        type: command.type,
        details: cmd.raw_command,
        tx: result.arcTxHash ?? result.suiTxDigest ?? ""
      });
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      const { repo } = this.ctx;
      if (executing) {
        repo.setCommandStatus(executing.cmdId, "FAILED", { errorText: e });
        await this.updateDocRow(executing.docId, executing.cmdId, { status: "FAILED", error: e });
        await this.audit(executing.docId, `${executing.cmdId} FAILED ${e}`);
      }
    } finally {
      this.executorRunning = false;
    }
  }

  private async execute(docId: string, cmdId: string, command: ParsedCommand) {
    const { repo, config, arc, circle, deepbook } = this.ctx;
    const yellow = this.ctx.yellow;
    if (command.type === "SETUP") {
      const existing = loadDocSecrets({ repo, masterKey: config.DOCWALLET_MASTER_KEY, docId });
      const secrets = existing ?? createAndStoreDocSecrets({ repo, masterKey: config.DOCWALLET_MASTER_KEY, docId });
      repo.setDocAddresses(docId, { evmAddress: secrets.evm.address, suiAddress: secrets.sui.address });

      let tables = await loadDocWalletTables({ docs: this.ctx.docs, docId });
      await writeConfigValue({
        docs: this.ctx.docs,
        docId,
        configTable: tables.config.table,
        key: "EVM_ADDRESS",
        value: secrets.evm.address
      });
      await writeConfigValue({
        docs: this.ctx.docs,
        docId,
        configTable: tables.config.table,
        key: "SUI_ADDRESS",
        value: secrets.sui.address
      });
      await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "STATUS", value: "READY" });

      // Circle/Arc dev-controlled wallet (track-winner path)
      let circleAddr = "";
      if (circle) {
        const existingCircle = repo.getCircleWallet(docId);
        if (existingCircle) {
          circleAddr = existingCircle.wallet_address;
          await writeConfigValue({
            docs: this.ctx.docs,
            docId,
            configTable: tables.config.table,
            key: "ARC_WALLET_ADDRESS",
            value: existingCircle.wallet_address
          });
          await writeConfigValue({
            docs: this.ctx.docs,
            docId,
            configTable: tables.config.table,
            key: "ARC_WALLET_ID",
            value: existingCircle.wallet_id
          });
        } else {
          const w = await circle.createArcWallet();
          repo.upsertCircleWallet({ docId, walletSetId: w.walletSetId, walletId: w.walletId, walletAddress: w.address });
          circleAddr = w.address;
          await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "ARC_WALLET_ADDRESS", value: w.address });
          await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "ARC_WALLET_ID", value: w.walletId });
        }
      }

      const extra = circleAddr ? ` ARC=${circleAddr}` : "";
      return { resultText: `EVM=${secrets.evm.address} SUI=${secrets.sui.address}${extra}` };
    }

    if (command.type === "POLICY_ENS") {
      repo.setDocPolicy(docId, { policySource: "ENS", ensName: command.ensName });
      let tables = await loadDocWalletTables({ docs: this.ctx.docs, docId });
      await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "POLICY_SOURCE", value: "ENS" });
      tables = await loadDocWalletTables({ docs: this.ctx.docs, docId });
      await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "ENS_NAME", value: command.ensName });
      return { resultText: `ENS=${command.ensName}` };
    }

    if (command.type === "QUORUM") {
      repo.setDocQuorum(docId, command.quorum);
      const tables = await loadDocWalletTables({ docs: this.ctx.docs, docId });
      await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "QUORUM", value: String(command.quorum) });
      return { resultText: `QUORUM=${command.quorum}` };
    }

    if (command.type === "SIGNER_ADD") {
      repo.upsertSigner({ docId, address: command.address, weight: command.weight });
      const tables = await loadDocWalletTables({ docs: this.ctx.docs, docId });
      const signers = repo.listSigners(docId).map((s) => s.address).join(",");
      await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "SIGNERS", value: signers });
      return { resultText: `SIGNER_ADDED=${command.address} WEIGHT=${command.weight}` };
    }

    if (command.type === "STATUS") {
      const q = repo.getDocQuorum(docId);
      const signerCount = repo.listSigners(docId).length;
      const y = repo.getYellowSession(docId);
      const status = y ? `YELLOW_SESSION=${y.app_session_id} v${y.version}` : "YELLOW_SESSION=NONE";
      return { resultText: `QUORUM=${q} SIGNERS=${signerCount} ${status}` };
    }

    if (command.type === "SESSION_CREATE") {
      if (!yellow) throw new Error("Yellow disabled (set YELLOW_ENABLED=1 and YELLOW_RPC_URL)");
      const signers = repo.listSigners(docId);
      if (signers.length === 0) throw new Error("No signers registered. Use the /join page first.");
      const quorum = repo.getDocQuorum(docId);
      const keyRows = signers.map((s) => ({ signer: s, key: repo.getYellowSessionKey({ docId, signerAddress: s.address }) }));
      const missing = keyRows.filter((r) => !r.key).map((r) => r.signer.address);
      if (missing.length) throw new Error(`Missing Yellow session keys for: ${missing.join(", ")}. Re-join via /join/<docId>.`);

      const now = Date.now();
      const expired = keyRows.filter((r) => (r.key?.expires_at ?? 0) <= now).map((r) => r.signer.address);
      if (expired.length) throw new Error(`Expired Yellow session keys for: ${expired.join(", ")}. Re-join via /join/<docId>.`);

      const definition = {
        protocol: "NitroRPC/0.4",
        // Participants are the delegated session keys so they can sign without repeated wallet prompts.
        participants: keyRows.map((r) => r.key!.session_key_address),
        weights: signers.map((s) => s.weight),
        quorum,
        challenge: 86400,
        nonce: Date.now()
      };
      const definitionJson = JSON.stringify(definition);
      const signerPrivateKeysHex = keyRows.map((r) => {
        const plain = decryptWithMasterKey({ masterKey: config.DOCWALLET_MASTER_KEY, blob: r.key!.encrypted_session_key_private });
        const parsed = JSON.parse(plain.toString("utf8")) as { privateKeyHex: `0x${string}` };
        return parsed.privateKeyHex;
      });

      const created = await yellow.createAppSession({ signerPrivateKeysHex, definition, sessionData: `DocWallet:${docId}` });
      const appSessionId = created.appSessionId as any;

      repo.upsertYellowSession({ docId, appSessionId, definitionJson, version: 0, status: "OPEN" });

      const tables = await loadDocWalletTables({ docs: this.ctx.docs, docId });
      await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "YELLOW_SESSION_ID", value: appSessionId });
      await writeConfigValue({ docs: this.ctx.docs, docId, configTable: tables.config.table, key: "YELLOW_PROTOCOL", value: "NitroRPC/0.4" });

      return { resultText: `YELLOW_SESSION=${appSessionId}` };
    }

    const secrets = loadDocSecrets({ repo, masterKey: config.DOCWALLET_MASTER_KEY, docId });
    if (!secrets) throw new Error("Missing wallets. Run DW /setup first.");

    // Re-check policy at execution time (best effort).
    const d = repo.getDoc(docId);
    const ensName = d?.ens_name?.trim() ?? "";
    const policyDecision = await this.checkPolicyIfPresent(ensName, command);
    if (!policyDecision.ok) throw new Error(policyDecision.reason);

    if (command.type === "PAYOUT") {
      if (circle) {
        const w = repo.getCircleWallet(docId);
        if (!w) throw new Error("Missing Circle Arc wallet. Run DW /setup first.");
        const out = await circle.payout({
          walletAddress: w.wallet_address as `0x${string}`,
          destinationAddress: command.to,
          amountUsdc: command.amountUsdc
        });
        const txText = out.txHash ? `ArcTx=${out.txHash}` : `CircleState=${out.state}`;
        return {
          arcTxHash: out.txHash as any,
          resultText: `CircleTx=${out.circleTxId} ${txText}`
        };
      }

      if (!arc) throw new Error("Arc disabled (ARC_ENABLED=0)");
      const tx = await arc.transferUsdc({ privateKeyHex: secrets.evm.privateKeyHex, to: command.to, amountUsdc: command.amountUsdc });
      return { arcTxHash: tx.txHash, resultText: `ArcTx=${tx.txHash}` };
    }

    if (command.type === "PAYOUT_SPLIT") {
      if (circle) {
        const w = repo.getCircleWallet(docId);
        if (!w) throw new Error("Missing Circle Arc wallet. Run DW /setup first.");
        const txHashes: string[] = [];
        const circleTxIds: string[] = [];
        for (const r of command.recipients) {
          const amt = (command.amountUsdc * r.pct) / 100;
          const out = await circle.payout({
            walletAddress: w.wallet_address as `0x${string}`,
            destinationAddress: r.to,
            amountUsdc: amt
          });
          circleTxIds.push(out.circleTxId);
          if (out.txHash) txHashes.push(out.txHash);
        }
        return {
          arcTxHash: (txHashes[0] as any) ?? undefined,
          resultText: `CircleTxs=${circleTxIds.join(",")} ArcTxs=${txHashes.join(",")}`
        };
      }

      if (!arc) throw new Error("Arc disabled (ARC_ENABLED=0)");
      const txHashes: string[] = [];
      for (const r of command.recipients) {
        const amt = (command.amountUsdc * r.pct) / 100;
        const tx = await arc.transferUsdc({ privateKeyHex: secrets.evm.privateKeyHex, to: r.to, amountUsdc: amt });
        txHashes.push(tx.txHash);
      }
      return {
        arcTxHash: txHashes[0],
        resultText: `ArcTxs=${txHashes.join(",")}`
      };
    }

    if (!deepbook) throw new Error("DeepBook disabled (set DEEPBOOK_ENABLED=1)");

    const tables = await loadDocWalletTables({ docs: this.ctx.docs, docId });
    const cfg = readConfig(tables.config.table);
    const poolKey = cfg["DEEPBOOK_POOL"]?.value?.trim() || "SUI_DBUSDC";
    const managerId = cfg["DEEPBOOK_MANAGER"]?.value?.trim() || undefined;

    const deepbookRes = await deepbook.execute({ docId, command, wallet: secrets.sui, poolKey, managerId });
    if (deepbookRes?.managerId && !managerId) {
      try {
        await writeConfigValue({
          docs: this.ctx.docs,
          docId,
          configTable: tables.config.table,
          key: "DEEPBOOK_MANAGER",
          value: deepbookRes.managerId
        });
      } catch {
        // ignore
      }
    }
    if (!deepbookRes) return { resultText: `OK` };
    if (deepbookRes.kind === "order") {
      return {
        suiTxDigest: deepbookRes.txDigest,
        resultText: `SuiTx=${deepbookRes.txDigest} OrderId=${deepbookRes.orderId}`
      };
    }
    return {
      suiTxDigest: deepbookRes.txDigest,
      resultText: `SuiTx=${deepbookRes.txDigest}`
    };
  }

  private async checkPolicyIfPresent(ensName: string, command: ParsedCommand) {
    const { ens } = this.ctx;
    if (!ens || !ensName) return { ok: true as const };
    const policy = await ens.getPolicy(ensName);
    if (!policy) return { ok: true as const };
    return evaluatePolicy(policy, command);
  }

  private async updateDocRow(docId: string, cmdId: string, updates: { status?: string; result?: string; error?: string }) {
    const { docs } = this.ctx;
    const tables = await loadDocWalletTables({ docs, docId });
    const rows = readCommandsTable(tables.commands.table);
    const row = rows.find((r) => r.id === cmdId);
    if (!row) return;
    const mergedResult =
      updates.result === undefined
        ? undefined
        : (() => {
            const next = updates.result ?? "";
            const prev = row.result ?? "";
            if (!prev.trim()) return next;
            if (!next.trim()) return prev;
            if (prev.includes(next)) return prev;
            return `${prev} ${next}`.trim();
          })();
    await updateCommandsRowCells({
      docs,
      docId,
      commandsTable: tables.commands.table,
      rowIndex: row.rowIndex,
      updates: { status: updates.status, result: mergedResult, error: updates.error }
    });
  }

  private async audit(docId: string, message: string) {
    const { docs } = this.ctx;
    await appendAuditRow({
      docs,
      docId,
      timestampIso: new Date().toISOString(),
      message
    });
  }

  private async updateRowByIndex(
    docId: string,
    rowIndex: number,
    updates: { id?: string; status?: string; approvalUrl?: string; result?: string; error?: string }
  ) {
    const { docs } = this.ctx;
    const tables = await loadDocWalletTables({ docs, docId });
    await updateCommandsRowCells({ docs, docId, commandsTable: tables.commands.table, rowIndex, updates });
  }
}

function generateCmdId(docId: string, raw: string): string {
  const now = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const h = sha256Hex(`${docId}|${raw}|${Date.now()}`).slice(0, 10);
  return `cmd_${now}_${h}`;
}
