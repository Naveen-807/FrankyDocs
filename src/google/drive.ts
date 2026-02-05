import type { drive_v3 } from "googleapis";

export type DriveDoc = {
  id: string;
  name: string;
  modifiedTime?: string;
};

export async function listAccessibleDocs(params: {
  drive: drive_v3.Drive;
  namePrefix?: string;
  pageSize?: number;
}): Promise<DriveDoc[]> {
  const { drive, namePrefix, pageSize = 50 } = params;
  const qParts = ["mimeType='application/vnd.google-apps.document'", "trashed=false"];
  if (namePrefix) qParts.push(`name contains '${namePrefix.replace(/'/g, "\\'")}'`);

  const res = await drive.files.list({
    q: qParts.join(" and "),
    pageSize,
    fields: "files(id,name,modifiedTime)"
  });
  const files = res.data.files ?? [];
  return files
    .filter((f): f is Required<Pick<typeof f, "id" | "name">> & typeof f => Boolean(f.id && f.name))
    .map((f) => ({ id: f.id!, name: f.name!, modifiedTime: f.modifiedTime ?? undefined }));
}

