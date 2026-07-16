import { NextResponse } from "next/server";
import { getDeliveryReport } from "@/server/reports";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  return NextResponse.json(await getDeliveryReport());
}
