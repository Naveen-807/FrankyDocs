import { z } from "zod";
import type { ParsedCommand } from "./commands.js";

export const EnsPolicySchema = z
  .object({
    requireApproval: z.boolean().optional(),
    maxNotionalUsdc: z.number().positive().optional(),
    allowedPairs: z.array(z.string()).optional(),
    payoutAllowlist: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).optional(),
    denyCommands: z.array(z.string()).optional()
  })
  .strict();

export type EnsPolicy = z.infer<typeof EnsPolicySchema>;

export type PolicyDecision = { ok: true } | { ok: false; reason: string };

export function evaluatePolicy(policy: EnsPolicy, cmd: ParsedCommand): PolicyDecision {
  const deny = new Set((policy.denyCommands ?? []).map((s) => s.toUpperCase()));
  if (deny.has(cmd.type.toUpperCase())) return { ok: false, reason: `Blocked by policy (denyCommands: ${cmd.type})` };

  if (cmd.type === "LIMIT_BUY" || cmd.type === "LIMIT_SELL") {
    if (policy.allowedPairs && !policy.allowedPairs.includes("SUI/USDC")) {
      return { ok: false, reason: "Blocked by policy (allowedPairs)" };
    }
    if (policy.maxNotionalUsdc !== undefined) {
      const notional = cmd.qty * cmd.price;
      if (notional > policy.maxNotionalUsdc) {
        return { ok: false, reason: `Blocked by policy (maxNotionalUsdc=${policy.maxNotionalUsdc})` };
      }
    }
  }

  if (cmd.type === "PAYOUT") {
    if (policy.payoutAllowlist && !policy.payoutAllowlist.map((a) => a.toLowerCase()).includes(cmd.to.toLowerCase())) {
      return { ok: false, reason: "Blocked by policy (payoutAllowlist)" };
    }
  }

  if (cmd.type === "PAYOUT_SPLIT") {
    if (policy.payoutAllowlist) {
      const allow = new Set(policy.payoutAllowlist.map((a) => a.toLowerCase()));
      for (const r of cmd.recipients) {
        if (!allow.has(r.to.toLowerCase())) return { ok: false, reason: "Blocked by policy (payoutAllowlist)" };
      }
    }
  }

  return { ok: true };
}

