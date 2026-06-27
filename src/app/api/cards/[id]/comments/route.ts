import { NextResponse } from "next/server";
import { addComment, getCard } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";
import { syncCurrentUser } from "@/server/users";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const { body } = await req.json();
  if (!body?.trim()) return new Response("Comentário vazio", { status: 400 });
  const author = await syncCurrentUser();
  await addComment(id, body.trim(), author?.id);
  return NextResponse.json(await getCard(id), { status: 201 });
}
