import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/server/workflows";

export function workflowError(error: unknown) {
  if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError || error instanceof ZodError) return NextResponse.json({ error: "Entrada inválida" }, { status: 400 });
  return NextResponse.json({ error: "Não foi possível concluir a operação" }, { status: 500 });
}
