import { describe, expect, it } from "vitest";
import { decryptWithMasterKey, encryptWithMasterKey } from "../src/wallet/crypto.js";
describe("crypto", () => {
    it("roundtrips plaintext", () => {
        const masterKey = Buffer.alloc(32, 7).toString("hex");
        const plaintext = Buffer.from("hello world", "utf8");
        const blob = encryptWithMasterKey({ masterKey, plaintext });
        const out = decryptWithMasterKey({ masterKey, blob });
        expect(out.toString("utf8")).toBe("hello world");
    });
});
