import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { updateCard, moveCard, getCard, deleteCard } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";
import { syncCurrentUser } from "@/server/users";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const card = await getCard(id);
  if (!card) return new Response("Not found", { status: 404 });
  return NextResponse.json(card);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.columnId !== undefined || body.position !== undefined) {
    await moveCard(id, body.columnId, body.position);
    // Arrastou p/ "Em Andamento" → o logado vira responsável (connect, não remove os outros).
    if (body.columnId) {
      const col = await db.column.findUnique({ where: { id: body.columnId }, select: { name: true } });
      if (col && /andamento/i.test(col.name)) {
        const me = await syncCurrentUser();
        if (me) await db.card.update({ where: { id }, data: { assignees: { connect: { id: me.id } } } });
      }
    }
  }
  const hasFields = ["title", "description", "details", "priority", "type", "version", "code", "dueDate", "assignees", "labels"]
    .some((k) => k in body);
  if (hasFields) await updateCard(id, body);
  return NextResponse.json(await getCard(id));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const result = await deleteCard(id);
  if (!result) return new Response("Not found", { status: 404 });
  // Limpa os blobs órfãos (card + comentários) — best-effort.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blobs = result.urls.filter((u) => u.includes("blob.vercel-storage.com"));
    if (blobs.length) { try { await del(blobs); } catch { /* já removidos ou externos */ } }
  }
  return NextResponse.json({ ok: true });
}
