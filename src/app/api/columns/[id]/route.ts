import { NextResponse } from "next/server";
import { deleteColumn, moveColumn, updateColumn } from "@/server/columns";
import { requireUser } from "@/server/auth-guard";

const NOT_FOUND = /não encontrada/;

// Coluna com card não é excluída (ver deleteColumn) → 409, não 400: o pedido
// está bem formado, o estado do recurso é que impede.
const CONFLICT = /ainda tem|Já existe/;

function fail(error: unknown, fallback: string): Response {
  if (!(error instanceof Error)) return new Response(fallback, { status: 500 });
  if (NOT_FOUND.test(error.message)) return new Response(error.message, { status: 404 });
  if (CONFLICT.test(error.message)) return new Response(error.message, { status: 409 });
  return new Response(error.message, { status: 400 });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const body = await req.json();
  const moving = body.position !== undefined || body.index !== undefined;
  const editing = body.name !== undefined || body.color !== undefined;
  if (!moving && !editing) return new Response("Nada a atualizar", { status: 400 });
  try {
    // position/index reordenam; name/color editam. Um PATCH pode fazer os dois;
    // o resultado devolvido é sempre o estado final da coluna.
    let column = moving
      ? await moveColumn(id, { position: body.position, index: body.index })
      : null;
    if (editing) column = await updateColumn(id, { name: body.name, color: body.color });
    return NextResponse.json(column);
  } catch (error) {
    return fail(error, "Falha ao atualizar coluna");
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await deleteColumn(id));
  } catch (error) {
    return fail(error, "Falha ao excluir coluna");
  }
}
