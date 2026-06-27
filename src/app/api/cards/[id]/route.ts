import { NextResponse } from "next/server";
import { updateCard, moveCard, getCard } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";
import { broadcastBoardChanged } from "@/lib/pusher-server";
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
  }
  const hasFields = ["title", "description", "priority", "code", "dueDate", "assignees", "labels"]
    .some((k) => k in body);
  if (hasFields) await updateCard(id, body);
  return NextResponse.json(await getCard(id));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  await db.card.delete({ where: { id } });
  await broadcastBoardChanged();
  return NextResponse.json({ ok: true });
}
