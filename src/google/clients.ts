import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export function createDocsClient(auth: OAuth2Client) {
  return google.docs({ version: "v1", auth });
}

export function createDriveClient(auth: OAuth2Client) {
  return google.drive({ version: "v3", auth });
}

