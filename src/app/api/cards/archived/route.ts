import { NextResponse } from "next/server";
import { listArchivedCards } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const board = new URL(req.url).searchParams.get("board");
  try {
    return NextResponse.json(await listArchivedCards(board));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Board não encontrado", { status: 404 });
  }
}
