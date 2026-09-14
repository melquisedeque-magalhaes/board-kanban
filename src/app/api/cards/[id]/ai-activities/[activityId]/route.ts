import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { finishAiActivity } from "@/server/ai-activities";
import { workflowError } from "@/server/workflow-http";
import { z } from "zod";

export async function PATCH(req: Request, context: { params: Promise<{ id: string; activityId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  try {
    const { id, activityId } = await context.params;
    const body = z.object({ status: z.enum(["COMPLETED", "FAILED", "CANCELLED"]) }).parse(await req.json());
    return NextResponse.json(await finishAiActivity(id, activityId, body.status));
  } catch (error) { return workflowError(error); }
}
