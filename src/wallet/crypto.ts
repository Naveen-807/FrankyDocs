import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function parseMasterKey(masterKey: string): Buffer {
  const trimmed = masterKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  return Buffer.from(trimmed, "base64");
}

export type EncryptedBlob = string; // v1:<b64(iv|tag|ciphertext)>

export function encryptWithMasterKey(params: { masterKey: string; plaintext: Buffer }): EncryptedBlob {
  const key = parseMasterKey(params.masterKey);
  if (key.length !== 32) throw new Error("DOCWALLET_MASTER_KEY must decode to 32 bytes");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(params.plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return `v1:${packed.toString("base64")}`;
}

export function decryptWithMasterKey(params: { masterKey: string; blob: EncryptedBlob }): Buffer {
  const key = parseMasterKey(params.masterKey);
  if (key.length !== 32) throw new Error("DOCWALLET_MASTER_KEY must decode to 32 bytes");
  const [ver, b64] = params.blob.split(":", 2);
  if (ver !== "v1" || !b64) throw new Error("Unsupported encrypted blob format");
  const packed = Buffer.from(b64, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

