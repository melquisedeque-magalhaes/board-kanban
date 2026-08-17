import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { listColumnSubscribers } from "@/server/notifications";

const missingResourceMessages = new Set(["Coluna não encontrada", "Usuário não encontrado"]);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;

  const { id } = await ctx.params;
  try {
    const rows = await listColumnSubscribers(id);
    return NextResponse.json(rows.map(({ user }) => ({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
    })));
  } catch (error) {
    if (error instanceof Error && missingResourceMessages.has(error.message)) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
