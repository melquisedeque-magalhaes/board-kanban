import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { subscribeToColumn, unsubscribeFromColumn } from "@/server/notifications";

const missingResourceMessages = new Set(["Coluna não encontrada", "Usuário não encontrado"]);

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;

  const { id, userId } = await ctx.params;
  try {
    await subscribeToColumn(id, userId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && missingResourceMessages.has(error.message)) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; userId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;

  const { id, userId } = await ctx.params;
  try {
    await unsubscribeFromColumn(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && missingResourceMessages.has(error.message)) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
