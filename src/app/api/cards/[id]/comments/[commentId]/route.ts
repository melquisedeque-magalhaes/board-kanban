import { NextResponse } from "next/server";
import { getComment, updateComment, deleteComment, getCard } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";
import { syncCurrentUser } from "@/server/users";
import { purgeBlobs } from "@/server/blobs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id, commentId } = await ctx.params;

  const comment = await getComment(commentId);
  if (!comment || comment.cardId !== id) return new Response("Not found", { status: 404 });

  // Só o autor edita o próprio comentário (comentários legados sem autor: liberados).
  const me = await syncCurrentUser();
  if (comment.authorId && comment.authorId !== me?.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const { body } = await req.json();
  const text = (body ?? "").trim();
  if (!text) return new Response("Comentário vazio", { status: 400 });

  await updateComment(commentId, text);
  return NextResponse.json(await getCard(id));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id, commentId } = await ctx.params;

  const comment = await getComment(commentId);
  if (!comment || comment.cardId !== id) return new Response("Not found", { status: 404 });

  // Mesma regra da edição: só o autor apaga o próprio comentário
  // (comentários legados sem autor: liberados).
  const me = await syncCurrentUser();
  if (comment.authorId && comment.authorId !== me?.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const result = await deleteComment(commentId);
  if (result) await purgeBlobs(result.urls); // blobs dos anexos do comentário
  return NextResponse.json(await getCard(id));
}
