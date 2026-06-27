import { NextResponse } from "next/server";
import { boardVersion } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  return NextResponse.json({ version: await boardVersion() });
}
