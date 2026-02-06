# FrankyDocs — HackMoney 2026 submission copy-paste

Use these for the submission form (title, description, partner prize explanations).

---

## Project title
**FrankyDocs — Google Doc as Multi-Chain DeFi Treasury**

---

## Short description (for listing / first impression)
FrankyDocs turns a Google Doc into a multi-chain DeFi treasury. Proposers need no wallet; signers approve once in the browser (MetaMask, WalletConnect, or Yellow delegated keys). We execute USDC payouts on **Arc** (Circle dev wallets), limit orders on **Sui DeepBook V3**, and gasless approval state via **Yellow** NitroRPC — all from one shared Doc with full audit log.

---

## Long description (if the form has a “full description” field)
FrankyDocs is an autonomous agent that uses a Google Doc as the interface for a multi-sig treasury. Team members type commands (e.g. `DW PAYOUT 100 USDC TO 0x...`, `DW LIMIT_BUY SUI 10 USDC @ 1.50`) in a Commands table. The agent parses commands, enforces policy from ENS (`docwallet.policy`), collects approvals via a local approval server (MetaMask or Yellow delegated keys for gasless approvals), and executes on Arc (USDC via Circle developer-controlled wallets) and Sui (DeepBook V3). Results and a full audit trail are written back into the same Doc.

**Sponsor integrations:**
- **Arc:** USDC payouts, split payments, scheduled payments; Circle developer-controlled wallets; agent decision engine that logs alerts and auto-proposals in the Doc.
- **Sui / DeepBook:** Full order lifecycle (limit/market buy and sell, cancel, settle) via PTBs; BalanceManager; no dApp UI — everything from the Doc.
- **Yellow:** NitroRPC app sessions with delegated signer keys; gasless approval state updates via `submit_app_state`; approval metrics (gas saved) shown in the Doc.

Built for HackMoney 2026. Tech: Node.js, Google Docs/Drive API, viem, @mysten/sui & @mysten/deepbook-v3, @circle-fin/developer-controlled-wallets, Yellow NitroRPC.

---

## Partner prize 1 (e.g. Arc)
**How we used [Partner]:** FrankyDocs runs an autonomous agent that executes USDC payouts, split payments, and scheduled payments on Arc testnet. We use Circle developer-controlled wallets for custody and Arc RPC for transfers. Spending limits and allowlists are enforced via ENS `docwallet.policy`. The agent logs decisions (stale commands, low gas, idle capital, auto-proposals) into the Google Doc. **Concrete use:** Circle SDK for wallet creation and USDC transfers; Arc for on-chain execution.

---

## Partner prize 2 (e.g. Sui / DeepBook)
**How we used [Partner]:** We bring full Sui DeepBook V3 order lifecycle into a Google Doc. Users type commands like `DW LIMIT_BUY SUI 5 USDC @ 1.02`; the agent places the order via PTBs, and open orders and balances are synced back into the Doc. We use BalanceManager, limit/market orders, cancel, and settle — no separate dApp. **Concrete use:** @mysten/deepbook-v3 and @mysten/sui for PTB construction and execution.

---

## Partner prize 3 (e.g. Yellow)
**How we used [Partner]:** We use Yellow NitroRPC to create app sessions with delegated signer keys. Signers authorize once; approval state is submitted off-chain via `submit_app_state`, so approval collection is gasless. We show approval count and estimated gas saved in the Doc. **Concrete use:** NitroRPC `create_app_session` and `submit_app_state` with multi-party signatures.

---

## Demo video checklist (reminder)
- 2–4 minutes, 720p+, you speaking (no TTS)
- Show: Doc → `DW /setup` → Join + QUORUM 2 → Arc payout (approve → result) → Sui limit order → Audit Log
- Optionally: Yellow session or ENS policy blocking a command
