import { NextResponse } from "next/server";
import { nextCardCode } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

// Reserva a próxima chave (consome do contador). Usado pelo dialog de criação
// para mostrar a chave final antes de salvar. Cancelar deixa um furo no
// sequencial — comportamento aceito (ver spec TI-129).
export async function POST() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const code = await nextCardCode();
  return NextResponse.json({ code });
}
