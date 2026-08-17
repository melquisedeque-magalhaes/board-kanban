import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { markAllNotificationsRead } from "@/server/notifications";
import { syncCurrentUser } from "@/server/users";

export async function POST() {
  const unauth = await requireUser();
  if (unauth) return unauth;

  const me = await syncCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  await markAllNotificationsRead(me.id);
  return NextResponse.json({ ok: true });
}
