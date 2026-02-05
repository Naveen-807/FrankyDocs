import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/core/commands.js";

describe("parseCommand", () => {
  it("parses setup", () => {
    expect(parseCommand("DW /setup")).toEqual({ ok: true, value: { type: "SETUP" } });
  });

  it("parses limit buy", () => {
    const r = parseCommand("DW LIMIT_BUY SUI 50 USDC @ 1.02");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ type: "LIMIT_BUY", qty: 50, price: 1.02 });
  });

  it("rejects missing DW prefix", () => {
    const r = parseCommand("LIMIT_BUY SUI 50 USDC @ 1.02");
    expect(r.ok).toBe(false);
  });

  it("parses payout split", () => {
    const r = parseCommand(
      "DW PAYOUT_SPLIT 10 USDC TO 0x0000000000000000000000000000000000000001:50,0x0000000000000000000000000000000000000002:50"
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.type).toBe("PAYOUT_SPLIT");
  });

  it("parses session create", () => {
    expect(parseCommand("DW SESSION_CREATE")).toEqual({ ok: true, value: { type: "SESSION_CREATE" } });
  });

  it("parses signer add", () => {
    const r = parseCommand("DW SIGNER_ADD 0x0000000000000000000000000000000000000001 WEIGHT 2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ type: "SIGNER_ADD", weight: 2 });
  });

  it("parses quorum", () => {
    expect(parseCommand("DW QUORUM 2")).toEqual({ ok: true, value: { type: "QUORUM", quorum: 2 } });
  });
});
