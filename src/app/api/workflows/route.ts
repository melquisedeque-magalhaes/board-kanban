import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth-guard";
import { createWorkflow, listWorkflows } from "@/server/workflows";
import { workflowError } from "@/server/workflow-http";

export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  try { return NextResponse.json(await listWorkflows()); }
  catch (error) { return workflowError(error); }
}

export async function POST(req: Request) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  try { return NextResponse.json(await createWorkflow(await req.json()), { status: 201 }); }
  catch (error) { return workflowError(error); }
}
