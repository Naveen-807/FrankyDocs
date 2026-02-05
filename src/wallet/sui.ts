import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

export type SuiWalletMaterial = {
  suiPrivateKey: string; // sui bech32 string
  address: string;
};

export function generateSuiWallet(): SuiWalletMaterial {
  const kp = Ed25519Keypair.generate();
  const suiPrivateKey = kp.getSecretKey();
  return { suiPrivateKey, address: kp.toSuiAddress() };
}

export function loadSuiKeypair(suiPrivateKey: string): Ed25519Keypair {
  const decoded = decodeSuiPrivateKey(suiPrivateKey);
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
}

