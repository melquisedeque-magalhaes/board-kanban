import { NextResponse } from "next/server";
import { listColumns } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  return NextResponse.json(await listColumns());
}
