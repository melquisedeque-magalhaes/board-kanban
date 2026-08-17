import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { notificationVersion } from "@/server/notifications";
import { syncCurrentUser } from "@/server/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;

  const me = await syncCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  return NextResponse.json(await notificationVersion(me.id));
}
