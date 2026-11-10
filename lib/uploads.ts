import "server-only";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { run } from "./db";
import { saveFile } from "./storage";
import { DOC_TYPES } from "./schema";

export const MAX_FILE = 10 * 1024 * 1024;
export const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".odt", ".png", ".jpg", ".jpeg", ".xlsx"];

export type Upload = { type: string; file: File };

/** Collect files from inputs named doc_<TYPE>. Returns an error message or the uploads. */
export function collectUploads(form: FormData): Upload[] | string {
  const out: Upload[] = [];
  for (const type of DOC_TYPES) {
    for (const v of form.getAll(`doc_${type}`)) {
      if (!(v instanceof File) || v.size === 0) continue;
      const ext = path.extname(v.name).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) return `${v.name}: only ${ALLOWED_EXT.join(", ")} files are accepted.`;
      if (v.size > MAX_FILE) return `${v.name} is larger than 10 MB.`;
      out.push({ type, file: v });
    }
  }
  return out;
}

/** Stores the files and records them against a proposal version or a post-approval report. */
export async function saveUploads(uploads: Upload[], owner: { versionId: number } | { reportId: number }, userId: number) {
  for (const { type, file } of uploads) {
    const stored = `${randomUUID()}${path.extname(file.name).toLowerCase()}`;
    const key = await saveFile(stored, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
    await run(
      `INSERT INTO documents (version_id, report_id, doc_type, file_name, stored_name, mime_type, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "versionId" in owner ? owner.versionId : null,
      "reportId" in owner ? owner.reportId : null,
      type,
      path.basename(file.name).slice(0, 255),
      key,
      file.type || "application/octet-stream",
      file.size,
      userId,
    );
  }
}
