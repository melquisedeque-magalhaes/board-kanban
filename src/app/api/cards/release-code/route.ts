import { NextResponse } from "next/server";
import { releaseCardCode } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

// Libera uma chave reservada quando o usuário cancela a criação sem salvar.
// Best-effort: só devolve a chave se ela ainda for a última emitida
// (ver releaseCardCode). Chamado no unmount do dialog com keepalive.
export async function POST(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { code } = await req.json().catch(() => ({ code: undefined }));
  if (typeof code === "string" && code) await releaseCardCode(code);
  return NextResponse.json({ ok: true });
}
