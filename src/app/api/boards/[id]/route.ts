import { NextResponse } from "next/server";
import { deleteBoard, updateBoard } from "@/server/boards";
import { requireUser } from "@/server/auth-guard";

// Board com card, board principal e nome repetido são estado do recurso → 409.
const CONFLICT = /ainda tem|Já existe|principal/;

function fail(error: unknown, fallback: string): Response {
  if (!(error instanceof Error)) return new Response(fallback, { status: 500 });
  if (/não encontrado|Record to update not found/.test(error.message)) {
    return new Response("Board não encontrado", { status: 404 });
  }
  if (CONFLICT.test(error.message)) return new Response(error.message, { status: 409 });
  return new Response(error.message, { status: 400 });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const { name, description } = await req.json();
  if (name === undefined && description === undefined) return new Response("Nada a atualizar", { status: 400 });
  try {
    return NextResponse.json(await updateBoard(id, { name, description }));
  } catch (error) {
    return fail(error, "Falha ao atualizar board");
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await deleteBoard(id));
  } catch (error) {
    return fail(error, "Falha ao excluir board");
  }
}
