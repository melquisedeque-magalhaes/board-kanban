import { NextResponse } from "next/server";
import { archiveCard, unarchiveCard } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

// POST { archived: boolean } — arquiva (true) ou restaura (false) um card.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  const { archived } = await req.json().catch(() => ({ archived: true }));
  const card = archived === false ? await unarchiveCard(id) : await archiveCard(id);
  return NextResponse.json(card);
}
