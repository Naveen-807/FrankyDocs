import { z } from "zod";

export type ParsedCommand =
  | { type: "SETUP" }
  | { type: "STATUS" }
  | { type: "SESSION_CREATE" }
  | { type: "SIGNER_ADD"; address: `0x${string}`; weight: number }
  | { type: "QUORUM"; quorum: number }
  | { type: "LIMIT_BUY"; base: "SUI"; quote: "USDC"; qty: number; price: number }
  | { type: "LIMIT_SELL"; base: "SUI"; quote: "USDC"; qty: number; price: number }
  | { type: "CANCEL"; orderId: string }
  | { type: "SETTLE" }
  | { type: "PAYOUT"; amountUsdc: number; to: `0x${string}` }
  | { type: "PAYOUT_SPLIT"; amountUsdc: number; recipients: Array<{ to: `0x${string}`; pct: number }> }
  | { type: "POLICY_ENS"; ensName: string };

export const ParsedCommandSchema: z.ZodType<ParsedCommand, z.ZodTypeDef, unknown> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SETUP") }),
  z.object({ type: z.literal("STATUS") }),
  z.object({ type: z.literal("SESSION_CREATE") }),
  z.object({
    type: z.literal("SIGNER_ADD"),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`),
    weight: z.number().int().positive()
  }),
  z.object({ type: z.literal("QUORUM"), quorum: z.number().int().positive() }),
  z.object({
    type: z.literal("LIMIT_BUY"),
    base: z.literal("SUI"),
    quote: z.literal("USDC"),
    qty: z.number().positive(),
    price: z.number().positive()
  }),
  z.object({
    type: z.literal("LIMIT_SELL"),
    base: z.literal("SUI"),
    quote: z.literal("USDC"),
    qty: z.number().positive(),
    price: z.number().positive()
  }),
  z.object({ type: z.literal("CANCEL"), orderId: z.string().min(1) }),
  z.object({ type: z.literal("SETTLE") }),
  z.object({
    type: z.literal("PAYOUT"),
    amountUsdc: z.number().positive(),
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`)
  }),
  z.object({
    type: z.literal("PAYOUT_SPLIT"),
    amountUsdc: z.number().positive(),
    recipients: z
      .array(
        z.object({
          to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`),
          pct: z.number().positive()
        })
      )
      .min(2)
  }),
  z.object({ type: z.literal("POLICY_ENS"), ensName: z.string().min(3) })
]);

export type ParseResult =
  | { ok: true; value: ParsedCommand }
  | { ok: false; error: string };

function parseNumber(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function parseCommand(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Empty command" };
  const norm = trimmed.replace(/\s+/g, " ");
  const parts = norm.split(" ");
  if (parts[0]?.toUpperCase() !== "DW") return { ok: false, error: "Commands must start with DW" };
  const op = (parts[1] ?? "").toUpperCase();

  if (op === "/SETUP" || op === "SETUP") return { ok: true, value: { type: "SETUP" } };
  if (op === "STATUS") return { ok: true, value: { type: "STATUS" } };
  if (op === "SESSION_CREATE") return { ok: true, value: { type: "SESSION_CREATE" } };
  if (op === "QUORUM") {
    const qStr = parts[2] ?? "";
    const quorum = parseNumber(qStr);
    if (quorum === null || quorum <= 0 || Math.floor(quorum) !== quorum) return { ok: false, error: "Invalid quorum" };
    return { ok: true, value: { type: "QUORUM", quorum } };
  }
  if (op === "SIGNER_ADD") {
    // DW SIGNER_ADD 0xADDR WEIGHT 2
    const address = parts[2] ?? "";
    const weightKw = (parts[3] ?? "").toUpperCase();
    const weightStr = parts[4] ?? "";
    if (weightKw !== "WEIGHT") return { ok: false, error: "SIGNER_ADD expects WEIGHT <n>" };
    const weight = parseNumber(weightStr);
    if (weight === null || weight <= 0 || Math.floor(weight) !== weight) return { ok: false, error: "Invalid signer weight" };
    const parsed = ParsedCommandSchema.safeParse({ type: "SIGNER_ADD", address, weight });
    if (!parsed.success) return { ok: false, error: "Invalid signer address" };
    return { ok: true, value: parsed.data };
  }
  if (op === "SETTLE") return { ok: true, value: { type: "SETTLE" } };

  if (op === "LIMIT_BUY" || op === "LIMIT_SELL") {
    // DW LIMIT_BUY SUI 50 USDC @ 1.02
    const base = (parts[2] ?? "").toUpperCase();
    const qtyStr = parts[3] ?? "";
    const quote = (parts[4] ?? "").toUpperCase();
    const at = parts[5] ?? "";
    const priceStr = parts[6] ?? "";

    if (base !== "SUI" || (quote !== "USDC" && quote !== "DBUSDC")) {
      return { ok: false, error: "Only SUI/USDC supported in MVP (DeepBook testnet uses DBUSDC)" };
    }
    if (at !== "@") return { ok: false, error: "Expected '@' before price" };

    const qty = parseNumber(qtyStr);
    const price = parseNumber(priceStr);
    if (qty === null || qty <= 0) return { ok: false, error: "Invalid qty" };
    if (price === null || price <= 0) return { ok: false, error: "Invalid price" };

    const value: ParsedCommand =
      op === "LIMIT_BUY"
        ? { type: "LIMIT_BUY", base: "SUI", quote: "USDC", qty, price }
        : { type: "LIMIT_SELL", base: "SUI", quote: "USDC", qty, price };
    return { ok: true, value };
  }

  if (op === "CANCEL") {
    const orderId = parts[2];
    if (!orderId) return { ok: false, error: "Missing order id" };
    return { ok: true, value: { type: "CANCEL", orderId } };
  }

  if (op === "PAYOUT") {
    // DW PAYOUT 1 USDC TO 0x...
    const amountStr = parts[2] ?? "";
    const unit = (parts[3] ?? "").toUpperCase();
    const toKw = (parts[4] ?? "").toUpperCase();
    const to = parts[5] ?? "";
    if (unit !== "USDC") return { ok: false, error: "PAYOUT expects USDC" };
    if (toKw !== "TO") return { ok: false, error: "PAYOUT expects TO <address>" };
    const amountUsdc = parseNumber(amountStr);
    if (amountUsdc === null || amountUsdc <= 0) return { ok: false, error: "Invalid payout amount" };
    const parsed = ParsedCommandSchema.safeParse({ type: "PAYOUT", amountUsdc, to });
    if (!parsed.success) return { ok: false, error: "Invalid payout address" };
    return { ok: true, value: parsed.data };
  }

  if (op === "PAYOUT_SPLIT") {
    // DW PAYOUT_SPLIT 10 USDC TO 0xA:50,0xB:50
    const amountStr = parts[2] ?? "";
    const unit = (parts[3] ?? "").toUpperCase();
    const toKw = (parts[4] ?? "").toUpperCase();
    const spec = parts.slice(5).join(" ").trim();
    if (unit !== "USDC") return { ok: false, error: "PAYOUT_SPLIT expects USDC" };
    if (toKw !== "TO") return { ok: false, error: "PAYOUT_SPLIT expects TO <addr:pct,...>" };
    const amountUsdc = parseNumber(amountStr);
    if (amountUsdc === null || amountUsdc <= 0) return { ok: false, error: "Invalid payout amount" };
    if (!spec) return { ok: false, error: "Missing split recipients" };

    const recipients: Array<{ to: string; pct: number }> = [];
    for (const part of spec.split(",")) {
      const [addr, pctStr] = part.trim().split(":");
      if (!addr || !pctStr) return { ok: false, error: "Split recipients must be <address>:<pct>" };
      const pct = parseNumber(pctStr);
      if (pct === null || pct <= 0) return { ok: false, error: "Invalid split pct" };
      recipients.push({ to: addr.trim(), pct });
    }
    const pctSum = recipients.reduce((a, r) => a + r.pct, 0);
    if (Math.abs(pctSum - 100) > 0.0001) return { ok: false, error: "Split pct must sum to 100" };

    const parsed = ParsedCommandSchema.safeParse({ type: "PAYOUT_SPLIT", amountUsdc, recipients });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid split payout" };
    return { ok: true, value: parsed.data };
  }

  if (op === "POLICY") {
    const sub = (parts[2] ?? "").toUpperCase();
    if (sub !== "ENS") return { ok: false, error: "Only POLICY ENS <name.eth> supported" };
    const ensName = parts[3];
    if (!ensName) return { ok: false, error: "Missing ENS name" };
    return { ok: true, value: { type: "POLICY_ENS", ensName } };
  }

  return { ok: false, error: `Unknown command: ${op}` };
}
