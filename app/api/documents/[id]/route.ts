import { getCurrentUser, isStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { get } from "@/lib/db";
import { canViewProposal } from "@/lib/recms";
import { readFile } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = Number((await ctx.params).id);
  const doc = await get<{ stored_name: string; file_name: string; mime_type: string; proposal_id: number; researcher_id: number; report_id: number | null }>(
    `SELECT d.stored_name, d.file_name, d.mime_type, d.report_id, p.proposal_id, p.researcher_id
       FROM documents d
       LEFT JOIN proposal_versions v ON v.version_id = d.version_id
       LEFT JOIN post_approval_reports r ON r.report_id = d.report_id
       JOIN proposals p ON p.proposal_id = COALESCE(v.proposal_id, r.proposal_id)
      WHERE d.document_id = ?`,
    id,
  );
  // Post-approval attachments: only the researcher and staff. Protocol documents: also accepted reviewers.
  const allowed = doc && (doc.report_id ? isStaff(user) || doc.researcher_id === user.user_id : await canViewProposal(user, doc));
  if (!doc || !allowed) return new Response("Not found", { status: 404 });
  const bytes = await readFile(doc.stored_name);
  if (!bytes) return new Response("File missing", { status: 410 });
  await audit("DOCUMENT_DOWNLOAD", { userId: user.user_id, entity: "document", entityId: id, details: doc.file_name });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
