import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { UPLOAD_DIR, get } from "@/lib/db";
import { canViewProposal } from "@/lib/recms";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const doc = get<{ stored_name: string; file_name: string; mime_type: string; proposal_id: number; researcher_id: number }>(
    `SELECT d.stored_name, d.file_name, d.mime_type, p.proposal_id, p.researcher_id
       FROM documents d JOIN proposal_versions v ON v.version_id = d.version_id
       JOIN proposals p ON p.proposal_id = v.proposal_id
      WHERE d.document_id = ?`,
    Number((await ctx.params).id),
  );
  if (!doc || !canViewProposal(user, doc)) return new Response("Not found", { status: 404 });
  const file = path.join(UPLOAD_DIR, path.basename(doc.stored_name));
  if (!fs.existsSync(file)) return new Response("File missing", { status: 410 });
  return new Response(fs.readFileSync(file), {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
