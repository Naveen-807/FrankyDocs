import type { ParsedCommand } from "../core/commands.js";
import type { SuiWalletMaterial } from "../wallet/sui.js";
import { loadSuiKeypair } from "../wallet/sui.js";

import { DeepBookClient as MystenDeepBookClient } from "@mysten/deepbook-v3";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

export type DeepBookExecuteResult =
  | { kind: "order"; txDigest: string; orderId: string; managerId: string }
  | { kind: "tx"; txDigest: string; managerId: string };

export interface DeepBookClient {
  execute(params: {
    docId: string;
    command: ParsedCommand;
    wallet: SuiWalletMaterial;
    poolKey: string;
    managerId?: string;
  }): Promise<DeepBookExecuteResult | null>;
}

type Network = "testnet";

export class DeepBookV3Client implements DeepBookClient {
  private sui: SuiClient;
  private network: Network;

  constructor(params: { network?: Network; rpcUrl: string }) {
    this.network = params.network ?? "testnet";
    this.sui = new SuiClient({ url: params.rpcUrl });
  }

  async execute(params: {
    docId: string;
    command: ParsedCommand;
    wallet: SuiWalletMaterial;
    poolKey: string;
    managerId?: string;
  }): Promise<DeepBookExecuteResult | null> {
    const { command } = params;
    if (command.type !== "LIMIT_BUY" && command.type !== "LIMIT_SELL" && command.type !== "CANCEL" && command.type !== "SETTLE") {
      return null;
    }
    if (this.network !== "testnet") throw new Error(`Unsupported DeepBook network: ${this.network}`);

    const signer = loadSuiKeypair(params.wallet.suiPrivateKey);
    const ownerAddress = params.wallet.address;
    const poolKey = params.poolKey;

    let managerId = params.managerId?.trim() || "";
    if (!managerId) {
      managerId = await this.createAndShareBalanceManager({ signer, ownerAddress });
    }

    const deepbook = this.makeDeepBookClient({ ownerAddress, managerId });
    const managerKey = "DOCWALLET_MANAGER";

    if (command.type === "LIMIT_BUY" || command.type === "LIMIT_SELL") {
      const isBid = command.type === "LIMIT_BUY";
      const clientOrderId = `${params.docId}:${Date.now()}`;

      const [baseKey, quoteKey] = splitPoolKey(poolKey);

      const openBefore = await safeOpenOrders(deepbook, poolKey, managerKey);

      const tx = new Transaction();
      if (isBid) {
        const notionalUsdc = Math.max(0, command.qty * command.price);
        deepbook.balanceManager.depositIntoManager(managerKey, quoteKey, notionalUsdc)(tx);
      } else {
        deepbook.balanceManager.depositIntoManager(managerKey, baseKey, command.qty)(tx);
      }

      deepbook.deepBook.placeLimitOrder({
        poolKey,
        balanceManagerKey: managerKey,
        clientOrderId,
        price: command.price,
        quantity: command.qty,
        isBid,
        payWithDeep: true
      })(tx);

      const result = await this.sui.signAndExecuteTransaction({
        signer,
        transaction: tx,
        options: { showEffects: true, showObjectChanges: true, showEvents: true }
      });
      const txDigest = String(result.digest ?? result.effects?.transactionDigest ?? "");
      if (!txDigest) throw new Error("DeepBook tx missing digest");

      const openAfter = await safeOpenOrders(deepbook, poolKey, managerKey);
      const orderId = pickNewOrderId({ before: openBefore, after: openAfter }) ?? clientOrderId;

      return { kind: "order", txDigest, orderId, managerId };
    }

    if (command.type === "CANCEL") {
      const tx = new Transaction();
      deepbook.deepBook.cancelOrder(poolKey, managerKey, command.orderId)(tx);
      const result = await this.sui.signAndExecuteTransaction({
        signer,
        transaction: tx,
        options: { showEffects: true }
      });
      const txDigest = String(result.digest ?? result.effects?.transactionDigest ?? "");
      if (!txDigest) throw new Error("DeepBook cancel tx missing digest");
      return { kind: "tx", txDigest, managerId };
    }

    // SETTLE: withdraw settled amounts + withdraw all manager balances back to owner (demo-friendly).
    const [baseKey, quoteKey] = splitPoolKey(poolKey);
    const tx = new Transaction();
    deepbook.deepBook.withdrawSettledAmounts(poolKey, managerKey)(tx);
    deepbook.balanceManager.withdrawAllFromManager(managerKey, baseKey, ownerAddress)(tx);
    deepbook.balanceManager.withdrawAllFromManager(managerKey, quoteKey, ownerAddress)(tx);

    const result = await this.sui.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true }
    });
    const txDigest = String(result.digest ?? result.effects?.transactionDigest ?? "");
    if (!txDigest) throw new Error("DeepBook settle tx missing digest");
    return { kind: "tx", txDigest, managerId };
  }

  private makeDeepBookClient(params: { ownerAddress: string; managerId: string }) {
    return new MystenDeepBookClient({
      client: this.sui as any,
      address: params.ownerAddress,
      env: this.network,
      balanceManagers: {
        DOCWALLET_MANAGER: { address: params.managerId }
      }
    }) as any;
  }

  private async createAndShareBalanceManager(params: { signer: any; ownerAddress: string }): Promise<string> {
    const deepbook = new MystenDeepBookClient({
      client: this.sui as any,
      address: params.ownerAddress,
      env: this.network
    }) as any;

    const tx = new Transaction();
    deepbook.balanceManager.createAndShareBalanceManager()(tx);
    const result = await this.sui.signAndExecuteTransaction({
      signer: params.signer,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true }
    });

    const changes = (result.objectChanges ?? []) as Array<any>;
    const manager = changes.find(
      (c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.includes("balance_manager::BalanceManager")
    );
    const managerId = manager?.objectId ?? manager?.object_id;
    if (!managerId) throw new Error("Failed to detect BalanceManager objectId from transaction");
    return String(managerId);
  }
}

function splitPoolKey(poolKey: string): [string, string] {
  const parts = poolKey.split("_").map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return ["SUI", "DBUSDC"];
  return [parts[0]!, parts[1]!];
}

async function safeOpenOrders(deepbook: any, poolKey: string, managerKey: string): Promise<string[]> {
  try {
    const out = await deepbook.accountOpenOrders(poolKey, managerKey);
    return Array.isArray(out) ? out.map(String) : [];
  } catch {
    return [];
  }
}

function pickNewOrderId(params: { before: string[]; after: string[] }): string | null {
  const before = new Set(params.before.map(String));
  for (const id of params.after) {
    if (!before.has(String(id))) return String(id);
  }
  return null;
}
