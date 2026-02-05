import http from "node:http";
import { randomBytes } from "node:crypto";
import type { docs_v1 } from "googleapis";
import { keccak256, recoverMessageAddress } from "viem";
import { Repo } from "./db/repo.js";
import { loadDocWalletTables, readCommandsTable, readConfig, updateCommandsRowCells, writeConfigValue, appendAuditRow } from "./google/docwallet.js";
import { decryptWithMasterKey, encryptWithMasterKey } from "./wallet/crypto.js";
import { generateEvmWallet } from "./wallet/evm.js";
import { NitroRpcYellowClient } from "./integrations/yellow.js";

type ServerDeps = {
  docs: docs_v1.Docs;
  repo: Repo;
  masterKey: string;
  port: number;
  publicBaseUrl: string;
  yellow?: NitroRpcYellowClient;
  yellowApplicationName?: string;
};

type Session = { docId: string; signerAddress: `0x${string}`; createdAt: number };
type PendingYellowJoin = {
  docId: string;
  address: `0x${string}`;
  weight: number;
  sessionKeyAddress: `0x${string}`;
  sessionKeyPrivateKeyHex: `0x${string}`;
  application: string;
  scope: string;
  allowances: Array<{ asset: string; amount: string }>;
  expiresAt: number;
  challengeMessage: string;
  createdAt: number;
};

export function startServer(deps: ServerDeps) {
  const sessions = new Map<string, Session>();
  const pendingYellowJoins = new Map<string, PendingYellowJoin>();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/") {
        const docs = deps.repo.listDocs();
        const rows = docs
          .map((d) => {
            const joinUrl = `${deps.publicBaseUrl}/join/${encodeURIComponent(d.doc_id)}`;
            const signersUrl = `${deps.publicBaseUrl}/signers/${encodeURIComponent(d.doc_id)}`;
            return `<li><code>${escapeHtml(d.name ?? d.doc_id)}</code><br/>` +
              `<a href="${joinUrl}">Join</a> · <a href="${signersUrl}">Signers</a></li>`;
          })
          .join("\n");

        return sendHtml(
          res,
          "DocWallet",
          `<h1>DocWallet</h1><p>Docs discovered: ${docs.length}</p><ul>${rows}</ul>`
        );
      }

      const joinMatch = matchPath(url.pathname, ["join", ":docId"]);
      if (req.method === "GET" && joinMatch) {
        const docId = decodeURIComponent(joinMatch.docId);
        return sendHtml(res, "Join", joinPageHtml({ docId }));
      }

      const signersMatch = matchPath(url.pathname, ["signers", ":docId"]);
      if (req.method === "GET" && signersMatch) {
        const docId = decodeURIComponent(signersMatch.docId);
        const quorum = deps.repo.getDocQuorum(docId);
        const signers = deps.repo.listSigners(docId);
        const rows = signers
          .map((s) => `<tr><td><code>${escapeHtml(s.address)}</code></td><td>${s.weight}</td></tr>`)
          .join("\n");
        return sendHtml(
          res,
          "Signers",
          `<h1>Signers</h1><p><code>${escapeHtml(docId)}</code></p><p>Quorum: <b>${quorum}</b></p>` +
            `<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Address</th><th>Weight</th></tr></thead><tbody>${rows}</tbody></table>`
        );
      }

      const cmdMatch = matchPath(url.pathname, ["cmd", ":docId", ":cmdId"]);
      if (req.method === "GET" && cmdMatch) {
        const docId = decodeURIComponent(cmdMatch.docId);
        const cmdId = decodeURIComponent(cmdMatch.cmdId);
        const session = getSession(req, sessions);
        if (!session || session.docId !== docId) return sendHtml(res, "Not signed in", notSignedInHtml({ docId }));

        const cmd = deps.repo.getCommand(cmdId);
        if (!cmd || cmd.doc_id !== docId) return sendHtml(res, "Not found", `<h1>Command not found</h1>`);

        return sendHtml(res, `Command ${cmdId}`, cmdPageHtml({ docId, cmdId, signerAddress: session.signerAddress, raw: cmd.raw_command, status: cmd.status }));
      }

      if (req.method === "POST" && url.pathname === "/api/join/start") {
        const body = await readJsonBody(req);
        const docId = String(body.docId ?? "");
        const address = String(body.address ?? "").toLowerCase();
        const weight = Number(body.weight ?? 1);

        if (!docId) return sendJson(res, 400, { ok: false, error: "Missing docId" });
        if (!/^0x[0-9a-f]{40}$/.test(address)) return sendJson(res, 400, { ok: false, error: "Invalid address" });
        if (!Number.isFinite(weight) || weight <= 0 || Math.floor(weight) !== weight) return sendJson(res, 400, { ok: false, error: "Invalid weight" });

        // If Yellow is enabled, require real delegated session key authorization (no stubs).
        if (deps.yellow) {
          const application = String(deps.yellowApplicationName ?? "DocWallet");
          const scope = "app.create,app.submit,transfer";
          const allowances: Array<{ asset: string; amount: string }> = [];
          const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

          const sk = generateEvmWallet();
          const out = await deps.yellow.authRequest({
            address: address as `0x${string}`,
            sessionKeyAddress: sk.address,
            application,
            scope,
            allowances,
            expiresAt
          });
          const challengeMessage = String(out?.challenge_message ?? out?.challengeMessage ?? out?.challenge ?? "");
          if (!challengeMessage) return sendJson(res, 502, { ok: false, error: `Yellow auth_request missing challenge_message` });

          const joinToken = randomToken();
          pendingYellowJoins.set(joinToken, {
            docId,
            address: address as `0x${string}`,
            weight,
            sessionKeyAddress: sk.address,
            sessionKeyPrivateKeyHex: sk.privateKeyHex,
            application,
            scope,
            allowances,
            expiresAt,
            challengeMessage,
            createdAt: Date.now()
          });

          const typedData = yellowPolicyTypedData({
            application,
            challenge: challengeMessage,
            scope,
            wallet: address as `0x${string}`,
            sessionKey: sk.address,
            expiresAt,
            allowances
          });

          return sendJson(res, 200, {
            ok: true,
            mode: "yellow",
            joinToken,
            sessionKeyAddress: sk.address,
            typedData
          });
        }

        // No Yellow: basic join uses personal_sign.
        const nonce = randomToken().slice(0, 8);
        const message = `DocWallet join\\nDocId: ${docId}\\nAddress: ${address}\\nWeight: ${weight}\\nNonce: ${nonce}`;
        return sendJson(res, 200, { ok: true, mode: "basic", message });
      }

      if (req.method === "POST" && url.pathname === "/api/join/finish") {
        const body = await readJsonBody(req);
        const mode = String(body.mode ?? "");
        if (mode !== "yellow" && mode !== "basic") return sendJson(res, 400, { ok: false, error: "Invalid mode" });

        if (mode === "basic") {
          const docId = String(body.docId ?? "");
          const address = String(body.address ?? "").toLowerCase();
          const weight = Number(body.weight ?? 1);
          const message = String(body.message ?? "");
          const signature = String(body.signature ?? "");

          if (!docId) return sendJson(res, 400, { ok: false, error: "Missing docId" });
          if (!/^0x[0-9a-f]{40}$/.test(address)) return sendJson(res, 400, { ok: false, error: "Invalid address" });
          if (!Number.isFinite(weight) || weight <= 0 || Math.floor(weight) !== weight) return sendJson(res, 400, { ok: false, error: "Invalid weight" });
          if (!message || !signature) return sendJson(res, 400, { ok: false, error: "Missing signature" });

          const recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
          if (recovered.toLowerCase() !== address) return sendJson(res, 401, { ok: false, error: "Bad signature" });

          deps.repo.upsertSigner({ docId, address, weight });
          const token = randomToken();
          sessions.set(token, { docId, signerAddress: address as `0x${string}`, createdAt: Date.now() });
          setCookie(res, "dw_session", token);
          await bestEffortSyncSignersToDoc({ docs: deps.docs, repo: deps.repo, docId });
          return sendJson(res, 200, { ok: true, signerAddress: address });
        }

        // Yellow mode
        if (!deps.yellow) return sendJson(res, 400, { ok: false, error: "Yellow is not enabled on this agent" });
        const joinToken = String(body.joinToken ?? "");
        const signature = String(body.signature ?? "");
        if (!joinToken || !signature) return sendJson(res, 400, { ok: false, error: "Missing joinToken/signature" });

        const pending = pendingYellowJoins.get(joinToken);
        if (!pending) return sendJson(res, 404, { ok: false, error: "Join session expired. Reload /join and try again." });

        // Expire pending joins after 10 minutes.
        if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
          pendingYellowJoins.delete(joinToken);
          return sendJson(res, 410, { ok: false, error: "Join session expired. Reload /join and try again." });
        }

        const verified = await deps.yellow.authVerify({ signature: signature as `0x${string}`, challengeMessage: pending.challengeMessage });
        const jwtToken = verified?.jwt_token ?? verified?.jwtToken ?? null;

        deps.repo.upsertSigner({ docId: pending.docId, address: pending.address, weight: pending.weight });
        const encrypted = encryptWithMasterKey({
          masterKey: deps.masterKey,
          plaintext: Buffer.from(JSON.stringify({ privateKeyHex: pending.sessionKeyPrivateKeyHex }), "utf8")
        });
        deps.repo.upsertYellowSessionKey({
          docId: pending.docId,
          signerAddress: pending.address,
          sessionKeyAddress: pending.sessionKeyAddress,
          encryptedSessionKeyPrivate: encrypted,
          expiresAt: pending.expiresAt,
          allowancesJson: JSON.stringify({ scope: pending.scope, allowances: pending.allowances }),
          jwtToken: jwtToken ? String(jwtToken) : null
        });

        // Cookie session for approvals
        const token = randomToken();
        sessions.set(token, { docId: pending.docId, signerAddress: pending.address, createdAt: Date.now() });
        setCookie(res, "dw_session", token);

        pendingYellowJoins.delete(joinToken);

        await bestEffortSyncSignersToDoc({ docs: deps.docs, repo: deps.repo, docId: pending.docId });
        return sendJson(res, 200, { ok: true, signerAddress: pending.address, sessionKeyAddress: pending.sessionKeyAddress });
      }

      if (req.method === "POST" && url.pathname === "/api/cmd/decision") {
        const body = await readJsonBody(req);
        const docId = String(body.docId ?? "");
        const cmdId = String(body.cmdId ?? "");
        const decision = String(body.decision ?? "").toUpperCase();
        if (!docId || !cmdId) return sendJson(res, 400, { ok: false, error: "Missing docId/cmdId" });
        if (decision !== "APPROVE" && decision !== "REJECT") return sendJson(res, 400, { ok: false, error: "Invalid decision" });

        const session = getSession(req, sessions);
        if (!session || session.docId !== docId) return sendJson(res, 401, { ok: false, error: "Not signed in for this doc" });

        const cmd = deps.repo.getCommand(cmdId);
        if (!cmd || cmd.doc_id !== docId) return sendJson(res, 404, { ok: false, error: "Command not found" });

        if (cmd.status !== "PENDING_APPROVAL") return sendJson(res, 409, { ok: false, error: `Cannot decide when status=${cmd.status}` });

        deps.repo.recordCommandApproval({ docId, cmdId, signerAddress: session.signerAddress, decision: decision as "APPROVE" | "REJECT" });

        if (decision === "REJECT") {
          deps.repo.setCommandStatus(cmdId, "REJECTED", { errorText: null });
          await bestEffortUpdateCommandRow({ docs: deps.docs, docId, cmdId, updates: { status: "REJECTED", error: "" } });
          await bestEffortAudit(deps.docs, docId, `${cmdId} REJECTED by ${session.signerAddress}`);
          deps.repo.clearCommandApprovals({ docId, cmdId });
          return sendJson(res, 200, { ok: true, status: "REJECTED" });
        }

        const quorum = deps.repo.getDocQuorum(docId);
        const signers = deps.repo.listSigners(docId);
        const weights = new Map(signers.map((s) => [s.address.toLowerCase(), s.weight]));
        const approvals = deps.repo.listCommandApprovals({ docId, cmdId }).filter((a) => a.decision === "APPROVE");
        const approvedWeight = approvals.reduce((sum, a) => sum + (weights.get(a.signer_address.toLowerCase()) ?? 0), 0);

        await bestEffortUpdateCommandRow({
          docs: deps.docs,
          docId,
          cmdId,
          updates: { result: `Approvals=${approvedWeight}/${quorum}` }
        });

        if (approvedWeight >= quorum) {
          // If Yellow is enabled, it is the source-of-truth for approvals (no silent fallbacks).
          const yellow = deps.yellow;
          const yellowSession = deps.repo.getYellowSession(docId);
          const parsed = safeParseParsedJson(cmd.parsed_json);
          const isSessionCreate = parsed?.type === "SESSION_CREATE";

          if (yellow && !yellowSession && !isSessionCreate) {
            return sendJson(res, 409, { ok: false, error: "Yellow session not created. Run DW SESSION_CREATE first." });
          }

          if (yellow && yellowSession && !isSessionCreate) {
            const payload = { docId, cmdId, command: cmd.raw_command, ts: Date.now(), approvals: approvals.map((a) => a.signer_address) };
            const sessionData = keccak256(new TextEncoder().encode(JSON.stringify(payload)));

            const signerPrivateKeysHex: Array<`0x${string}`> = [];
            for (const a of approvals) {
              const keyRow = deps.repo.getYellowSessionKey({ docId, signerAddress: a.signer_address });
              if (!keyRow) return sendJson(res, 409, { ok: false, error: `Missing Yellow session key for signer ${a.signer_address}. Re-join via /join/<docId>.` });
              if (keyRow.expires_at <= Date.now()) return sendJson(res, 409, { ok: false, error: `Expired Yellow session key for signer ${a.signer_address}. Re-join via /join/<docId>.` });
              const plain = decryptWithMasterKey({ masterKey: deps.masterKey, blob: keyRow.encrypted_session_key_private });
              const parsed = JSON.parse(plain.toString("utf8")) as { privateKeyHex: `0x${string}` };
              signerPrivateKeysHex.push(parsed.privateKeyHex);
            }

            const nextVersion = (yellowSession.version ?? 0) + 1;
            const out = await yellow.submitAppState({
              signerPrivateKeysHex,
              appSessionId: yellowSession.app_session_id,
              version: nextVersion,
              intent: "operate",
              sessionData
            });
            deps.repo.setYellowSessionVersion({ docId, version: out.version, status: "OPEN" });

            await bestEffortUpdateCommandRow({
              docs: deps.docs,
              docId,
              cmdId,
              updates: { result: `Approvals=${approvedWeight}/${quorum} YellowSession=${yellowSession.app_session_id} YellowV=${out.version}` }
            });
            await bestEffortAudit(deps.docs, docId, `${cmdId} Yellow submit_app_state v${out.version}`);
          }

          deps.repo.setCommandStatus(cmdId, "APPROVED", { errorText: null });
          await bestEffortUpdateCommandRow({ docs: deps.docs, docId, cmdId, updates: { status: "APPROVED", error: "" } });
          await bestEffortAudit(deps.docs, docId, `${cmdId} APPROVED (quorum ${approvedWeight}/${quorum})`);

          deps.repo.clearCommandApprovals({ docId, cmdId });
          return sendJson(res, 200, { ok: true, status: "APPROVED" });
        }

        return sendJson(res, 200, { ok: true, status: "PENDING_APPROVAL", approvedWeight, quorum });
      }

      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Not found");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(`Internal error: ${msg}`);
    }
  });

  server.listen(deps.port);
  return {
    url: deps.publicBaseUrl,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

async function bestEffortSyncSignersToDoc(params: { docs: docs_v1.Docs; repo: Repo; docId: string }) {
  const { docs, repo, docId } = params;
  try {
    const tables = await loadDocWalletTables({ docs, docId });
    const configMap = readConfig(tables.config.table);

    const signers = repo.listSigners(docId).map((s) => s.address);
    const quorum = repo.getDocQuorum(docId);

    if (configMap["SIGNERS"]) {
      await writeConfigValue({ docs, docId, configTable: tables.config.table, key: "SIGNERS", value: signers.join(",") });
    }
    if (configMap["QUORUM"]) {
      await writeConfigValue({ docs, docId, configTable: tables.config.table, key: "QUORUM", value: String(quorum) });
    }
  } catch {
    // ignore
  }
}

async function bestEffortUpdateCommandRow(params: {
  docs: docs_v1.Docs;
  docId: string;
  cmdId: string;
  updates: { status?: string; result?: string; error?: string };
}) {
  const { docs, docId, cmdId, updates } = params;
  try {
    const tables = await loadDocWalletTables({ docs, docId });
    const rows = readCommandsTable(tables.commands.table);
    const row = rows.find((r) => r.id === cmdId);
    if (!row) return;
    await updateCommandsRowCells({ docs, docId, commandsTable: tables.commands.table, rowIndex: row.rowIndex, updates: updates as any });
  } catch {
    // ignore
  }
}

async function bestEffortAudit(docs: docs_v1.Docs, docId: string, message: string) {
  try {
    await appendAuditRow({ docs, docId, timestampIso: new Date().toISOString(), message });
  } catch {
    // ignore
  }
}

function matchPath(pathname: string, parts: string[]): Record<string, string> | null {
  const segs = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segs.length !== parts.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const s = segs[i]!;
    if (p.startsWith(":")) out[p.slice(1)] = s;
    else if (p !== s) return null;
  }
  return out;
}

function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = rest.join("=");
  }
  return out;
}

function getSession(req: http.IncomingMessage, sessions: Map<string, Session>): Session | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["dw_session"];
  if (!token) return null;
  return sessions.get(token) ?? null;
}

function setCookie(res: http.ServerResponse, name: string, value: string) {
  res.setHeader("set-cookie", `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`);
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendHtml(res: http.ServerResponse, title: string, body: string) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell;max-width:960px;margin:32px auto;padding:0 16px;line-height:1.4}
code{background:#f5f5f5;padding:2px 6px;border-radius:6px}
button{padding:10px 14px;border-radius:10px;border:1px solid #ddd;background:#111;color:#fff;cursor:pointer}
button.secondary{background:#fff;color:#111}
input{padding:10px 12px;border-radius:10px;border:1px solid #ddd}
small{color:#666}
</style>
</head><body>${body}</body></html>`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function joinPageHtml(params: { docId: string }): string {
  const { docId } = params;
  return `
<h1>Join DocWallet</h1>
<p>Doc: <code>${escapeHtml(docId)}</code></p>
<p><button id="connect">Connect wallet</button> <small>(MetaMask / injected EVM wallet)</small></p>
<p>Weight: <input id="weight" type="number" min="1" value="1" style="width:120px"/></p>
<p><button id="join">Register signer</button></p>
<pre id="out" style="background:#f7f7f7;padding:12px;border-radius:12px;white-space:pre-wrap"></pre>
<script>
let address = null;
const out = document.getElementById('out');
function log(x){ out.textContent = String(x); }
document.getElementById('connect').onclick = async () => {
  if(!window.ethereum) return log('No injected wallet found.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  address = accounts && accounts[0];
  log('Connected: ' + address);
};
document.getElementById('join').onclick = async () => {
  if(!address) return log('Connect a wallet first.');
  const weight = Number(document.getElementById('weight').value || '1');
  const start = await fetch('/api/join/start', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ docId:'${escapeJs(docId)}', address, weight }) });
  const startData = await start.json();
  if(!startData.ok) return log('Error: ' + startData.error);

  if(startData.mode === 'basic'){
    const sig = await window.ethereum.request({ method: 'personal_sign', params: [startData.message, address] });
    const finish = await fetch('/api/join/finish', { method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body: JSON.stringify({ mode:'basic', docId:'${escapeJs(docId)}', address, weight, message: startData.message, signature: sig }) });
    const data = await finish.json();
    if(!data.ok) return log('Error: ' + data.error);
    return log('Joined! You can now open approval links from the Doc.');
  }

  // Yellow delegated session key flow
  const typed = startData.typedData;
  const sig = await window.ethereum.request({ method: 'eth_signTypedData_v4', params: [address, JSON.stringify(typed)] });
  const finish = await fetch('/api/join/finish', { method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
    body: JSON.stringify({ mode:'yellow', joinToken: startData.joinToken, signature: sig }) });
  const data = await finish.json();
  if(!data.ok) return log('Error: ' + data.error);
  log('Joined (Yellow)! Session key: ' + data.sessionKeyAddress + '\\nYou can now open approval links from the Doc.');
};
</script>
`;
}

function cmdPageHtml(params: { docId: string; cmdId: string; signerAddress: string; raw: string; status: string }): string {
  const { docId, cmdId, signerAddress, raw, status } = params;
  return `
<h1>Approve Command</h1>
<p>Doc: <code>${escapeHtml(docId)}</code></p>
<p>Signer: <code>${escapeHtml(signerAddress)}</code></p>
<p>Command ID: <code>${escapeHtml(cmdId)}</code></p>
<p>Status: <code>${escapeHtml(status)}</code></p>
<p>Command:</p>
<pre style="background:#f7f7f7;padding:12px;border-radius:12px;white-space:pre-wrap">${escapeHtml(raw)}</pre>
<p>
  <button id="approve">Approve</button>
  <button class="secondary" id="reject">Reject</button>
</p>
<pre id="out" style="background:#f7f7f7;padding:12px;border-radius:12px;white-space:pre-wrap"></pre>
<script>
const out = document.getElementById('out');
function log(x){ out.textContent = String(x); }
async function decide(decision){
  const res = await fetch('/api/cmd/decision', { method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
    body: JSON.stringify({ docId:'${escapeJs(docId)}', cmdId:'${escapeJs(cmdId)}', decision }) });
  const data = await res.json();
  if(!data.ok) return log('Error: ' + data.error);
  log('OK: ' + data.status);
}
document.getElementById('approve').onclick = () => decide('APPROVE');
document.getElementById('reject').onclick = () => decide('REJECT');
</script>
`;
}

function notSignedInHtml(params: { docId: string }): string {
  const { docId } = params;
  return `<h1>Not signed in</h1>
<p>Open the join page first to register your signer session:</p>
<p><a href="/join/${encodeURIComponent(docId)}">Join this doc</a></p>`;
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\\n/g, "\\n").replace(/\\r/g, "\\r");
}

function safeParseParsedJson(parsedJson: string | null): any | null {
  if (!parsedJson) return null;
  try {
    return JSON.parse(parsedJson);
  } catch {
    return null;
  }
}

function yellowPolicyTypedData(params: {
  application: string;
  challenge: string;
  scope: string;
  wallet: `0x${string}`;
  sessionKey: `0x${string}`;
  expiresAt: number;
  allowances: Array<{ asset: string; amount: string }>;
}) {
  return {
    domain: { name: params.application },
    types: {
      EIP712Domain: [{ name: "name", type: "string" }],
      Policy: [
        { name: "challenge", type: "string" },
        { name: "scope", type: "string" },
        { name: "wallet", type: "address" },
        { name: "session_key", type: "address" },
        { name: "expires_at", type: "uint64" },
        { name: "allowances", type: "Allowance[]" }
      ],
      Allowance: [
        { name: "asset", type: "string" },
        { name: "amount", type: "string" }
      ]
    },
    primaryType: "Policy",
    message: {
      challenge: params.challenge,
      scope: params.scope,
      wallet: params.wallet,
      session_key: params.sessionKey,
      expires_at: String(params.expiresAt),
      allowances: params.allowances ?? []
    }
  };
}
