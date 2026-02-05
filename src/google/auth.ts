import fs from "node:fs/promises";
import { google } from "googleapis";

export type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

export async function loadServiceAccountKey(source: string): Promise<ServiceAccountKey> {
  const trimmed = source.trim();
  const raw = trimmed.startsWith("{") ? trimmed : await fs.readFile(trimmed, "utf8");
  const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON must include client_email and private_key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

export async function createGoogleAuth(serviceAccountJson: string, scopes: string[]) {
  const key = await loadServiceAccountKey(serviceAccountJson);
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes
  });
  await auth.authorize();
  return auth;
}

