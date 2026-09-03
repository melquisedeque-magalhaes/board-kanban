import { NextResponse } from "next/server";
import { deleteAttachment, getAttachment } from "@/server/cards";
import { purgeBlobs } from "@/server/blobs";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; attId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id, attId } = await ctx.params;

  const att = await getAttachment(attId);
  if (!att || att.cardId !== id) return new Response("Not found", { status: 404 });

  await purgeBlobs([att.url]);
  await deleteAttachment(attId);
  return NextResponse.json({ ok: true });
}
