import { NextResponse } from "next/server";
import { updateCard, moveCard, getCard, deleteCard } from "@/server/cards";
import { purgeBlobs } from "@/server/blobs";
import { requireUser } from "@/server/auth-guard";
import { syncCurrentUser } from "@/server/users";

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
  const me = await syncCurrentUser();
  if (body.columnId !== undefined || body.position !== undefined) {
    await moveCard(id, body.columnId, body.position, me?.id);
  }
  const hasFields = ["title", "description", "details", "documentation", "priority", "type", "version", "branchUrl", "requestedBy", "code", "dueDate", "assignees", "labels", "parentId", "blocker", "blockerReason"]
    .some((k) => k in body);
  if (hasFields) await updateCard(id, body, me?.id);
  return NextResponse.json(await getCard(id));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const result = await deleteCard(id);
  if (!result) return new Response("Not found", { status: 404 });
  await purgeBlobs(result.urls); // blobs órfãos do card + dos comentários
  return NextResponse.json({ ok: true });
}
