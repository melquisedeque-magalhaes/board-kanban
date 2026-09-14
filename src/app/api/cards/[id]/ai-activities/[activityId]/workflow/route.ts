import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth-guard";
import { linkAiActivityWorkflow } from "@/server/ai-activities";
import { workflowError } from "@/server/workflow-http";

const input = z.object({
  workflowTagId: z.string().trim().min(1),
  applyToAll: z.boolean().default(false),
}).strict();

export async function POST(req: Request, context: { params: Promise<{ id: string; activityId: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  try {
    const { id, activityId } = await context.params;
    const body = input.parse(await req.json());
    return NextResponse.json(await linkAiActivityWorkflow(id, activityId, body));
  } catch (error) { return workflowError(error); }
}
