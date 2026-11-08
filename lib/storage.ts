import "server-only";
import fs from "node:fs";
import path from "node:path";
import { get as blobGet, put as blobPut } from "@vercel/blob";
import { DATA_DIR } from "./db";

/**
 * Uploaded documents. In production they go to private Vercel Blob storage
 * (set BLOB_READ_WRITE_TOKEN). Locally they are saved under data/uploads.
 * The returned key is what gets stored in documents.stored_name.
 */
const storedInBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const localDir = () => path.join(DATA_DIR, "uploads");

export async function saveFile(name: string, body: Buffer, contentType: string): Promise<string> {
  if (storedInBlob()) {
    const blob = await blobPut(`documents/${name}`, body, {
      access: "private",
      contentType,
      addRandomSuffix: false,
    });
    return blob.pathname;
  }
  fs.mkdirSync(localDir(), { recursive: true });
  fs.writeFileSync(path.join(localDir(), name), body);
  return name;
}

/** Returns the file bytes, or null if it no longer exists. */
export async function readFile(key: string): Promise<Buffer | null> {
  if (storedInBlob()) {
    const result = await blobGet(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  const file = path.join(localDir(), path.basename(key));
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}
