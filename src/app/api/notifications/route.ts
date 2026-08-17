import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { listNotifications } from "@/server/notifications";
import { syncCurrentUser } from "@/server/users";

export async function GET(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;

  const me = await syncCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const raw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 50));
  return NextResponse.json(await listNotifications(me.id, { cursor, limit }));
}
