import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { EnsPolicySchema, type EnsPolicy } from "../core/policy.js";

type CacheEntry = { fetchedAt: number; policy: EnsPolicy | null; raw?: string };

export class EnsPolicyClient {
  private cache = new Map<string, CacheEntry>();

  constructor(private rpcUrl: string, private ttlMs = 60_000) {}

  async getPolicy(ensName: string): Promise<EnsPolicy | null> {
    const key = ensName.toLowerCase();
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.fetchedAt < this.ttlMs) return cached.policy;

    const client = createPublicClient({ chain: mainnet, transport: http(this.rpcUrl) });
    const raw = await client.getEnsText({ name: ensName, key: "docwallet.policy" });
    if (!raw) {
      this.cache.set(key, { fetchedAt: now, policy: null });
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      this.cache.set(key, { fetchedAt: now, policy: null, raw });
      return null;
    }

    const parsed = EnsPolicySchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.cache.set(key, { fetchedAt: now, policy: null, raw });
      return null;
    }

    this.cache.set(key, { fetchedAt: now, policy: parsed.data, raw });
    return parsed.data;
  }
}
