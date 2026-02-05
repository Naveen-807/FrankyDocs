import type { Repo } from "../db/repo.js";
import { decryptWithMasterKey, encryptWithMasterKey } from "./crypto.js";
import { generateEvmWallet, type EvmWalletMaterial } from "./evm.js";
import { generateSuiWallet, loadSuiKeypair, type SuiWalletMaterial } from "./sui.js";
import { privateKeyToAccount } from "viem/accounts";

export type DocSecrets = {
  evm: EvmWalletMaterial;
  sui: SuiWalletMaterial;
};

type SecretsJson = { evmPrivateKeyHex: `0x${string}`; suiPrivateKey: string };

export function loadDocSecrets(params: { repo: Repo; masterKey: string; docId: string }): DocSecrets | null {
  const row = params.repo.getSecrets(params.docId);
  if (!row) return null;
  const plaintext = decryptWithMasterKey({ masterKey: params.masterKey, blob: row.encrypted_blob });
  const parsed = JSON.parse(plaintext.toString("utf8")) as SecretsJson;
  const evm = { privateKeyHex: parsed.evmPrivateKeyHex, address: privateKeyToAccount(parsed.evmPrivateKeyHex).address };
  const sui = { suiPrivateKey: parsed.suiPrivateKey, address: loadSuiKeypair(parsed.suiPrivateKey).toSuiAddress() };
  return { evm, sui };
}

export function createAndStoreDocSecrets(params: {
  repo: Repo;
  masterKey: string;
  docId: string;
}): DocSecrets {
  const evm = generateEvmWallet();
  const sui = generateSuiWallet();
  const json: SecretsJson = { evmPrivateKeyHex: evm.privateKeyHex, suiPrivateKey: sui.suiPrivateKey };
  const blob = encryptWithMasterKey({ masterKey: params.masterKey, plaintext: Buffer.from(JSON.stringify(json), "utf8") });
  params.repo.upsertSecrets(params.docId, blob);
  return { evm, sui };
}
