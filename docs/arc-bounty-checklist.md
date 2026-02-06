# Arc Bounty Checklist — HackMoney 2026

FrankyDocs can compete for **all three** Arc bounties. Use this to decide which to submit for and what to call out.

---

## Bounty 1: Best Chain Abstracted USDC Apps Using Arc as a Liquidity Hub ($5,000)

**What they want:** Apps that treat multiple chains as one liquidity surface; Arc to move USDC wherever needed; capital sourced, routed, settled across chains; seamless UX.

| Criteria | FrankyDocs | Include? |
|----------|------------|----------|
| Cross-chain payments, credit, or treasury | ✅ Treasury + PAYOUT on Arc; BRIDGE (Circle) arc↔sui; Sui DeepBook | **Yes** |
| Not locked to single chain | ✅ Arc (USDC) + Sui (trading) from one Doc | **Yes** |
| Seamless UX despite cross-chain | ✅ One Doc for all commands; one approval flow | **Yes** |
| **CIRCLE REQUIRED:** Arc, USDC | ✅ Arc RPC, USDC on Arc | **Yes** |
| **CIRCLE RECOMMENDED:** Circle Wallets, Circle Gateway | ✅ Circle Wallets. ❌ Gateway not used | **Yes** (Wallets only) |

**Verdict:** **Include.** You have Arc as USDC hub, multi-chain (Arc + Sui), BRIDGE, and one-doc UX. In the submission say: *"Arc is our USDC liquidity hub; we route payouts on Arc and trading on Sui; DW BRIDGE moves USDC across chains; one Doc abstracts chain complexity."*

---

## Bounty 2: Build Global Payouts and Treasury Systems with USDC on Arc ($2,500)

**What they want:** Payout/treasury systems that move USDC globally, automatically, reliably; payroll, revenue distribution, fund settlements; automated or agent-driven logic; multi-recipient, multi-chain; policy-based payouts.

| Criteria | FrankyDocs | Include? |
|----------|------------|----------|
| Automated or agent-driven payout logic | ✅ Agent parses commands, enforces policy, executes PAYOUT / PAYOUT_SPLIT / SCHEDULE | **Yes** |
| Multi-recipient, multi-chain settlement | ✅ PAYOUT_SPLIT (many recipients); Arc + Sui; BRIDGE | **Yes** |
| Treasury systems backed by RWAs | ❌ Not RWA-backed (optional in “looking for”) | Optional |
| Policy-based or condition-based payouts | ✅ ENS `docwallet.policy` (limits, allowlists, denyCommands) | **Yes** |
| **CIRCLE REQUIRED:** Arc, USDC | ✅ | **Yes** |
| **CIRCLE RECOMMENDED:** Circle Gateway, Circle Wallets, Bridge Kit | ✅ Circle Wallets; BRIDGE via Circle; ❌ Gateway/Bridge Kit not used | **Yes** |

**Verdict:** **Strongest fit. Primary Arc bounty.** You have agent-driven payouts, multi-recipient (PAYOUT_SPLIT), SCHEDULE (recurring), ENS policy, and Circle Wallets on Arc. In the submission say: *"We're submitting for **Build Global Payouts and Treasury Systems with USDC on Arc**. FrankyDocs is an agent-driven treasury: PAYOUT, PAYOUT_SPLIT, SCHEDULE on Arc via Circle developer-controlled wallets; policy-based limits and allowlists via ENS; multi-recipient payroll from one Doc."*

---

## Bounty 3: Best Agentic Commerce App Powered by Real-World Assets on Arc ($2,500)

**What they want:** Autonomous agents using real-world assets as productive capital; agents that make decisions, execute, manage risk; USDC-settled; RWA collateral, credit, oracle/market signals.

| Criteria | FrankyDocs | Include? |
|----------|------------|----------|
| AI agents that borrow, repay, rebalance vs RWA collateral | ❌ No RWA collateral or borrowing | **No** |
| Autonomous spending, payments, treasury management | ✅ Agent executes payouts; agentDecisionTick: alerts, idle capital, auto-proposals | **Yes** |
| USDC-denominated credit/cash flow backed by RWAs | ❌ No RWA-backed credit | **No** |
| Clear agent decision logic tied to oracle/market signals | ⚠️ Agent logic: balance thresholds, stale commands, idle capital, gas alerts (not Stork/oracle) | **Partial** |
| **REQUIRED:** Arc, USDC | ✅ | **Yes** |
| **RECOMMENDED:** Circle Wallets, Circle Contracts, Circle Gateway, Stork | ✅ Circle Wallets; ❌ Stork/oracle not used | **Yes** (Wallets) |

**Verdict:** **Partial fit.** You have “agentic” (autonomous agent, decision engine, treasury in USDC) but **not** RWA or oracle. You can still **include** this bounty and emphasize: *"Autonomous agent that manages treasury and payouts in USDC; clear decision logic (balance thresholds, idle capital alerts, auto-proposals); logged in the Doc. Extensible to RWA-backed positions and oracle signals."* Or focus on Bounty 1 + 2 if the form forces you to pick one Arc bounty.

---

## What Every Arc Bounty Requires (do all)

All three bounties state:

1. **Functional MVP and diagram:** Working frontend and backend **plus an architecture diagram.**
2. **Product feedback:** Clear, actionable feedback on Circle tools (heavily influences judgement).
3. **Video + presentation:** Core functions and effective use of Circle tools; detailed documentation.
4. **Link to GitHub/Replit repo.**

### You must add or clarify

| Requirement | Status | Action |
|-------------|--------|--------|
| **Architecture diagram** | Done | Use `docs/architecture.md` (mermaid: Doc → Agent → Arc/Circle + Sui + Yellow). Export to PNG via [mermaid.live](https://mermaid.live) or GitHub and attach/link in submission. |
| **Product feedback** | Not written | In the submission form, add 2–4 sentences: what worked well (e.g. Circle SDK wallet creation, USDC transfer API), what was missing or could improve (e.g. testnet limits, docs for CCTP/bridge), and one actionable suggestion. |
| **Video** | You have a demo script | In the video, **say “Arc” and “Circle”** and show: Circle wallet in Config, PAYOUT or PAYOUT_SPLIT executing, and (if possible) BRIDGE or SCHEDULE. Show the doc as “frontend” and the agent as “backend.” |
| **Repo link** | You have GitHub | Submit the repo; README already has architecture mermaid. |

---

## Which Arc bounty to submit for?

- **If you can only pick one Arc bounty:** Choose **Bounty 2 — Build Global Payouts and Treasury Systems with USDC on Arc.** It’s your strongest match.
- **If you can list multiple or “any”:** List **Bounty 2 (primary)** and **Bounty 1 (Chain Abstracted).** Optionally add Bounty 3 with the “agentic + treasury, extensible to RWA” framing above.
- In the submission text, **state clearly:** *“Submitting for: Build Global Payouts and Treasury Systems with USDC on Arc ($2,500). We also demonstrate Chain Abstracted USDC Apps (Arc as liquidity hub).”*

---

## One-paragraph Arc submission (copy-paste)

**For “How we used Arc / Circle” (Bounty 2 focus):**

FrankyDocs is an agent-driven treasury that runs on Arc and uses Circle developer-controlled wallets for USDC. We execute PAYOUT, PAYOUT_SPLIT, and SCHEDULE (recurring payroll) on Arc; policy-based limits and allowlists are enforced via ENS. The same Doc also triggers Sui DeepBook orders and cross-chain BRIDGE, with Arc as the USDC liquidity hub. All actions are logged in the Google Doc. **Circle tools used:** Arc, USDC, Circle Wallets (create wallet, USDC transfer, balance). We’re submitting for **Build Global Payouts and Treasury Systems with USDC on Arc** and also demonstrate **Chain Abstracted USDC Apps** (multi-chain, one UX).

---

## Summary

| Bounty | Fit | Include? |
|--------|-----|----------|
| **1. Chain Abstracted / Liquidity Hub ($5k)** | Strong | ✅ Yes — multi-chain, Arc hub, BRIDGE, one Doc |
| **2. Global Payouts and Treasury ($2.5k)** | Strongest | ✅ **Primary** — agent payouts, PAYOUT_SPLIT, SCHEDULE, policy |
| **3. Agentic Commerce / RWA ($2.5k)** | Partial | ⚠️ Optional — emphasize agent + treasury; RWA as future |

**Must-do for all:** Architecture diagram, Circle product feedback in submission, video that shows Arc + Circle by name and flow.
