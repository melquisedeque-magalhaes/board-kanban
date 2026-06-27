import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { deleteAttachment, listAttachments } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; attId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id, attId } = await ctx.params;

  const att = (await listAttachments(id)).find((a) => a.id === attId);
  if (!att) return new Response("Not found", { status: 404 });

  // Remove do Blob (best-effort) e do DB.
  if (process.env.BLOB_READ_WRITE_TOKEN && att.url.includes("blob.vercel-storage.com")) {
    try { await del(att.url); } catch { /* arquivo já removido ou URL externa */ }
  }
  await deleteAttachment(attId);
  return NextResponse.json({ ok: true });
}
