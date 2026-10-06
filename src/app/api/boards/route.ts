import { NextResponse } from "next/server";
import { createBoard, listBoards } from "@/server/boards";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  return NextResponse.json(await listBoards());
}

export async function POST(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const body = await req.json();
  if (typeof body.name !== "string") return new Response("Nome do board é obrigatório", { status: 400 });
  try {
    const board = await createBoard({
      name: body.name,
      description: typeof body.description === "string" ? body.description : null,
      copyColumnsFrom: typeof body.copyColumnsFrom === "string" ? body.copyColumnsFrom : null,
      columns: Array.isArray(body.columns) ? body.columns.filter((c: unknown) => typeof c === "string") : undefined,
    });
    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Falha ao criar board";
    return new Response(msg, { status: /Já existe/.test(msg) ? 409 : 400 });
  }
}
