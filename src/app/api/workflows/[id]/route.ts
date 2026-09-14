import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { updateWorkflow } from "@/server/workflows";
import { workflowError } from "@/server/workflow-http";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  try {
    const { id } = await context.params;
    return NextResponse.json(await updateWorkflow(id, await req.json()));
  } catch (error) { return workflowError(error); }
}
