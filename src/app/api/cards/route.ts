import { NextResponse } from "next/server";
import { listCards, createCard } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";
import { syncCurrentUser } from "@/server/users";
import type { Priority, CardType } from "@prisma/client";

export async function GET(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const sp = new URL(req.url).searchParams;
  const cards = await listCards({
    columnId: sp.get("columnId") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    priority: (sp.get("priority") as Priority) ?? undefined,
    type: (sp.get("type") as CardType) ?? undefined,
  });
  return NextResponse.json(cards);
}

export async function POST(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const body = await req.json();
  // Quem cria o card vira "Solicitado por" por padrão. Se o request já informar
  // requestedBy (escolha explícita na UI), respeita e não sobrescreve.
  if (!body.requestedBy) {
    const me = await syncCurrentUser();
    if (me) body.requestedBy = me.id;
  }
  const card = await createCard(body);
  return NextResponse.json(card, { status: 201 });
}
