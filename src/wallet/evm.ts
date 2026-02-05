import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

export type EvmWalletMaterial = {
  privateKeyHex: `0x${string}`;
  address: `0x${string}`;
};

export function generateEvmWallet(): EvmWalletMaterial {
  const pk = `0x${randomBytes(32).toString("hex")}` as const;
  const account = privateKeyToAccount(pk);
  return { privateKeyHex: pk, address: account.address };
}

