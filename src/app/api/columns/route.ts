import { NextResponse } from "next/server";
import { listColumns } from "@/server/cards";

export async function GET() {
  return NextResponse.json(await listColumns());
}
