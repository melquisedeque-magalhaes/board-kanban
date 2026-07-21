import { NextResponse } from "next/server";
import { peekCardCode } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

// Prévia da próxima chave para o dialog de criação. Read-only: NÃO consome o
// contador (o número real é atribuído no create). Abrir/fechar o dialog quantas
// vezes quiser não incrementa nada.
export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const code = await peekCardCode();
  return NextResponse.json({ code });
}
