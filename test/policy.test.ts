import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../src/core/policy.js";

describe("policy", () => {
  it("blocks over maxNotionalUsdc", () => {
    const decision = evaluatePolicy({ maxNotionalUsdc: 100 }, { type: "LIMIT_BUY", base: "SUI", quote: "USDC", qty: 200, price: 1 });
    expect(decision.ok).toBe(false);
  });

  it("allows payouts to allowlist", () => {
    const decision = evaluatePolicy(
      { payoutAllowlist: ["0x0000000000000000000000000000000000000001"] },
      { type: "PAYOUT", amountUsdc: 1, to: "0x0000000000000000000000000000000000000001" }
    );
    expect(decision.ok).toBe(true);
  });
});

