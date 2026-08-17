import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { setNotificationRead } from "@/server/notifications";
import { syncCurrentUser } from "@/server/users";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;

  const me = await syncCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  if (typeof body?.read !== "boolean") {
    return new Response("read must be a boolean", { status: 400 });
  }

  const { id } = await ctx.params;
  try {
    return NextResponse.json(await setNotificationRead(me.id, id, body.read));
  } catch (error) {
    if (error instanceof Error && error.message === "Notificação não encontrada") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
