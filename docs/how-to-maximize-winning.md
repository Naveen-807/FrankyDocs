# How to Maximize Winning — HackMoney 2026

Actionable checklist to maximize partner prizes and finalist chances.

---

## 1. Eligibility (do this first)

- [ ] **Confirm timeline:** All work must start after the hackathon start date. If you built FrankyDocs before that, you **cannot** win partner prizes or Finalist. Check with ETHGlobal if you have a “HackMoney 2026 extension” (e.g. new integrations or features) that qualifies.
- [ ] **Version control:** Ensure meaningful commits during the event (no single massive commit at the end).
- [ ] **AI attribution:** In the submission form, briefly note where you used AI (e.g. “Cursor for implementation help; docs and demo script written with AI assistance”). Keeps you within rules.

---

## 2. Demo video (2–4 minutes) — biggest lever

Judges and partners see this first. Follow ETHGlobal rules exactly.

### Must-haves
- [ ] **Length:** 2–4 minutes (not over 4; don’t speed up to fit).
- [ ] **Resolution:** 720p minimum (prefer 1080p).
- [ ] **Audio:** You speaking clearly; no TTS; minimal background noise.
- [ ] **Device:** Screen recording from a computer (not phone).
- [ ] **No long waits:** Pre-approve in MetaMask or use `DOC_CELL_APPROVALS=1` so you’re not waiting on-chain in the video.

### Structure (use your `docs/demo-script.md`)

| Time   | What to show | Why it matters |
|--------|--------------|----------------|
| 0:00–0:20 | Doc with template = “this is the wallet UI” | **WOW** — no dApp, no extension |
| 0:20–0:50 | `DW /setup` → addresses in Config | **Technicality** — multi-chain from one place |
| 0:50–1:10 | Join URL → 2 signers → `DW QUORUM 2` | **Usability** — one link to become signer |
| 1:10–1:50 | **Arc:** `DW PAYOUT` or `DW PAYOUT_SPLIT` → Approval URL → quorum → result + Audit Log | **Arc track** — agent + Circle/USDC |
| 1:50–2:20 | **Sui:** `DW LIMIT_BUY SUI 5 USDC @ 1.02` → approve → Open Orders table | **Sui/DeepBook track** — CLOB from a doc |
| 2:20–2:50 | Audit Log + Recent Activity (+ optional agent alert) | **Practicality** — full audit trail |
| 2:50–3:30 | Optional: Yellow `SESSION_CREATE` or Chat `!execute` or auto-proposal | **Yellow / originality** if time |

### Pro tips
- Rehearse once with a timer; cut anything that doesn’t show sponsor tech.
- One sentence per sponsor: “We use **Arc** for USDC payouts and Circle wallets,” “We use **Sui DeepBook** for limit orders,” “We use **Yellow** for gasless approvals.”
- If you have a policy: show one command **blocked** by ENS policy (e.g. over limit) → `REJECTED_POLICY` in the table. Strong for “governance” narrative.

---

## 3. Submission form — partner prizes

You can select **up to 3 partner prizes**. For each partner you select:

- [ ] **Explain how you used their tech** (1–3 sentences). Be explicit:
  - **Arc:** “FrankyDocs runs an autonomous agent that executes USDC payouts and split payments on Arc testnet. We use Circle developer-controlled wallets for custody and Arc RPC for transfers. Policy limits (ENS) and agent decision logs are written back into the Google Doc.”
  - **Sui / DeepBook:** “We execute full DeepBook V3 order lifecycle from a Google Doc: limit buy/sell, market orders, cancel, settle. We use PTBs and BalanceManager. No dApp UI — users type commands in the Doc.”
  - **Yellow:** “We use Yellow NitroRPC to create app sessions with delegated signer keys. Approval state is submitted via `submit_app_state` for gasless approval collection; only settlement is on-chain.”
- [ ] **Mention one concrete API/product** (e.g. Circle SDK, DeepBook V3 PTBs, NitroRPC `create_app_session`).
- [ ] **Give short feedback** (e.g. “Circle SDK made wallet creation and USDC transfer straightforward; we’d use mainnet when ready.”).

---

## 4. Repo and “judge-ready” experience

- [ ] **README:** Keep the one-line pitch at the top. Add a “HackMoney 2026” line: “Built for HackMoney 2026 — Arc, Sui DeepBook, Yellow.”
- [ ] **`.env.example`:** Complete and commented so a judge can run with testnet keys (no secrets).
- [ ] **`npm run doctor`:** Ensure it passes with a minimal valid `.env` (or document the one required var that may fail in CI).
- [ ] **One-command run:** `npm install && npm run dev` plus “Create a Doc named `[DocWallet] …` and share with service account” in README or `docs/execution-plan.md`.
- [ ] **Short “Judge setup” in README:** 3–5 bullets: clone, copy `.env.example` to `.env`, add paths/keys, `npm run dev`, create Doc and share. Makes judging smoother.

---

## 5. Finalist prep (if you get to live judging)

- [ ] **4 min demo:** Same as video but live — Doc → setup → quorum → Arc payout → Sui limit order → Audit Log. No dead time.
- [ ] **3 min Q&A — prepare answers for:**
  - “What inspired this?” → “Teams don’t use DeFi because of wallet UX; we wanted treasury in a place teams already use: a shared Doc.”
  - “Why Google Docs?” → “No install, familiar to 3B users, built-in audit trail and collaboration.”
  - “Hardest technical part?” → Pick one: e.g. “Keeping Doc table state and our SQLite/execution in sync,” or “PTB construction for DeepBook,” or “Yellow multi-sig session creation.”
  - “What’s next?” → “Mainnet, more chains, sponsored txs, passkey approvals.”
- [ ] **Backup:** Have a 30-second “if the Doc doesn’t load” version: show the approval server UI and the repo (commands, engine, integrations).

---

## 6. Quick wins before submit

| Action | Impact |
|--------|--------|
| Add 1–2 sentences to README: “Built for HackMoney 2026” + sponsor names | Partner visibility |
| Ensure `APPROVALS_TOTAL` and `EST_APPROVAL_TX_AVOIDED` are visible in Config in the demo | Yellow / gasless story |
| If you have an ENS name: set `docwallet.policy` and show a blocked command in the video | Governance / originality |
| Record video at 1080p, quiet room, clear mic | Usability / professionalism |
| In submission, name all three sponsors (Arc, Sui, Yellow) in the short description | Partner prize eligibility |

---

## 7. What not to do

- Don’t exceed 4 minutes or use speed-up to fit.
- Don’t submit below 720p or with TTS only.
- Don’t forget to select your 3 partner prizes and fill the “how you used our tech” for each.
- Don’t assume judges will open the repo; the video must stand alone.
- Don’t leave eligibility ambiguous — if you started before the hackathon, clarify with ETHGlobal before relying on partner/finalist prizes.

---

**Summary:** Maximize winning by (1) confirming eligibility, (2) nailing a 2–4 min video that shows Doc → Arc payout → Sui trade → audit, (3) writing explicit “how we used your stack” for each of your 3 partners, (4) making the repo one-command run and judge-friendly, and (5) preparing a tight live demo and Q&A for finalist judging.
