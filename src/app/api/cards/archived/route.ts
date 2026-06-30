import { NextResponse } from "next/server";
import { listArchivedCards } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  return NextResponse.json(await listArchivedCards());
}
