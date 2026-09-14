import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { listAiActivities, startAiActivity } from "@/server/ai-activities";
import { workflowError } from "@/server/workflow-http";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  try { return NextResponse.json(await listAiActivities((await context.params).id)); }
  catch (error) { return workflowError(error); }
}

export async function POST(req: Request, context: Context) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  try {
    const body = z.record(z.string(), z.unknown()).parse(await req.json());
    return NextResponse.json(await startAiActivity({ ...body, cardId: (await context.params).id }), { status: 201 });
  } catch (error) { return workflowError(error); }
}
