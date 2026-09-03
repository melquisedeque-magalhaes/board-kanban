import { NextResponse } from "next/server";
import { listColumns } from "@/server/cards";
import { createColumn } from "@/server/columns";
import { requireUser } from "@/server/auth-guard";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  return NextResponse.json(await listColumns());
}

export async function POST(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { name, color } = await req.json();
  if (typeof name !== "string") return new Response("Nome da coluna é obrigatório", { status: 400 });
  try {
    return NextResponse.json(await createColumn({ name, color }), { status: 201 });
  } catch (error) {
    // Nome vazio/duplicado e cor inválida são erro do cliente, não 500.
    return new Response(error instanceof Error ? error.message : "Falha ao criar coluna", { status: 400 });
  }
}
