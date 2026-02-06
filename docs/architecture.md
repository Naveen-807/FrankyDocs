# FrankyDocs — Architecture (for submission)

Required by Arc bounties: **working frontend and backend plus an architecture diagram.** Below is the diagram; the Doc is the frontend, the Node agent is the backend.

---

## High-level architecture

```mermaid
flowchart TB
  subgraph Frontend["Frontend (user-facing)"]
    Doc["Google Doc\n(Config, Commands, Chat,\nBalances, Open Orders,\nAudit Log, Recent Activity)"]
  end

  subgraph Backend["Backend (FrankyDocs Agent — Node.js)"]
    Engine["Engine\n(poll, parse, policy, execute)"]
    Repo["SQLite\n(commands, signers, schedules)"]
    Server["Approval Server\n/join, /cmd"]
  end

  subgraph ArcCircle["Arc + Circle (REQUIRED)"]
    Arc["Arc RPC\nUSDC on Arc"]
    Circle["Circle Developer\nControlled Wallets"]
  end

  subgraph OtherChains["Other chains"]
    Sui["Sui DeepBook V3\n(limit orders)"]
  end

  subgraph YellowOpt["Yellow (gasless approvals)"]
    Nitro["Yellow NitroRPC\n(session, submit_app_state)"]
  end

  Doc <-->|"Google Docs/Drive API"| Engine
  Engine <--> Repo
  Engine <--> Server
  Server -->|"MetaMask / WalletConnect"| User["Signers"]
  Engine -->|"USDC payouts, BRIDGE"| Circle
  Circle -->|"on-chain"| Arc
  Engine -->|"direct USDC transfer"| Arc
  Engine -->|"limit/market orders, PTBs"| Sui
  Engine -.->|"optional"| Nitro
  Engine -->|"ENS text record"| ENS["ENS\n(docwallet.policy)"]
```

---

## Arc / Circle data flow (for bounty submission)

- **Arc + USDC:** All USDC payouts and Circle wallet operations use **Arc** as the chain and **Circle developer-controlled wallets** for custody and transfers.
- **Multi-chain:** Same Doc triggers **Sui** (DeepBook) and **Arc** (USDC); **BRIDGE** moves USDC across chains (Circle transfer semantics).
- **Frontend:** Google Doc (Config, Commands, Chat, Balances, Open Orders, Audit Log, Recent Activity).
- **Backend:** Node.js agent (engine, SQLite, approval server); integrations: Arc RPC, Circle SDK, Sui/DeepBook, Yellow NitroRPC, ENS.

---

## Diagram export for submission

To attach an image: render the mermaid above (e.g. in GitHub, or at [mermaid.live](https://mermaid.live)) and save as `architecture.png`. Link it in your submission or README.
