import { NextResponse } from "next/server";
import { listCards, createCard } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";
import type { Priority } from "@prisma/client";

export async function GET(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const sp = new URL(req.url).searchParams;
  const cards = await listCards({
    columnId: sp.get("columnId") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    priority: (sp.get("priority") as Priority) ?? undefined,
  });
  return NextResponse.json(cards);
}

export async function POST(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const body = await req.json();
  const card = await createCard(body);
  return NextResponse.json(card, { status: 201 });
}
