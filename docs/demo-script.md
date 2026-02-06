# FrankyDocs Demo Script — All 3 Tracks (Arc, Sui, Yellow)

**Goal:** Win Arc, Sui/DeepBook, and Yellow. Yellow is mandatory in the demo — not optional.

## Pre-demo setup (before recording)
1. Configure `.env` using `.env.example`. **Set `YELLOW_ENABLED=1` and `YELLOW_RPC_URL`** so Yellow is live.
2. Run `npm run dev`.
3. Create a Google Doc named `[DocWallet] Company Treasury` and share it with the service account.
4. Open the Doc and keep the Approval Server open at `http://localhost:8787`.

---

## Recording flow (all 3 tracks in ~3–4 min)

### 0:00 - 0:18 Intro
Show the Doc with the template inserted. Say: **"This Doc is the wallet. We're going to show all three sponsor tracks: Arc, Sui DeepBook, and Yellow."**

### 0:18 - 0:45 Setup
```
DW /setup
```
Point out EVM and Sui addresses in Config.

### 0:45 - 1:05 Signers + Quorum
Open the Join URL, register two signers (use Yellow delegated keys if you're showing Yellow join flow), then:
```
DW QUORUM 2
```

### 1:05 - 1:35 **Track 1 — Arc:** Payout
```
DW PAYOUT 10 USDC TO 0x0000000000000000000000000000000000000001
```
(or `DW PAYOUT_SPLIT ...` if you prefer). Open Approval URL, approve with two signers. Show result and Audit Log. Optionally point to Config: Circle wallet, balances.

### 1:35 - 2:05 **Track 2 — Yellow:** Gasless session (mandatory)
```
DW SESSION_CREATE
```
Approve. Then show the **Sessions** table with the session ID and/or point to Config rows **`APPROVALS_TOTAL`** and **`EST_APPROVAL_TX_AVOIDED`** — say: **"Approvals are collected off-chain via Yellow NitroRPC; that's why we track gas saved here."** If you do another approval later (e.g. for Sui), briefly note that it used the Yellow session (gasless).

### 2:05 - 2:35 **Track 3 — Sui DeepBook:** Limit order
```
DW LIMIT_BUY SUI 5 USDC @ 1.02
```
Approve (gasless if Yellow session is active). Show the order in **Open Orders** table and optionally Balances.

### 2:35 - 3:00 Audit log and activity
Scroll to **Audit Log** and **Recent Activity**. One line: **"Every action — Arc payout, Yellow session, Sui order — is logged here in the same Doc."**

### 3:00 - 3:30 (optional buffer)
- Policy: `DW POLICY ENS <name>` and/or show a blocked command (`REJECTED_POLICY`).
- Chat: type "send 5 usdc to 0x..." → suggested command; or `!execute` to insert into Commands.

---

## Mandatory for Yellow track
- Show **`DW SESSION_CREATE`** and the Sessions table (or session status in Config).
- Show **`APPROVALS_TOTAL`** and **`EST_APPROVAL_TX_AVOIDED`** in Config and say that approvals are gasless via Yellow.
- In voiceover: name **Yellow NitroRPC** and **delegated session keys** so the Yellow judge sees clear integration.
