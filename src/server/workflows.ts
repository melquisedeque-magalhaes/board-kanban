import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export class DomainError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export const workflowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  externalId: z.string().trim().min(1).max(200).nullable().optional(),
  active: z.boolean().optional(),
}).strict();

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError("Dados inválidos: " + result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  return result.data;
}

export const errorCode = (error: unknown) => (error as { code?: string } | null)?.code;

export async function serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, retryDuplicate = false): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((errorCode(error) === "P2034" || (retryDuplicate && errorCode(error) === "P2002")) && attempt < 3) continue;
      if (errorCode(error) === "P2002") throw new DomainError("Identificador já cadastrado", 409);
      if (errorCode(error) === "P2025") throw new DomainError("Registro não encontrado", 404);
      throw error;
    }
  }
}

export function listWorkflows() {
  return db.workflow.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] });
}

export async function createWorkflow(input: unknown) {
  const data = parseInput(workflowSchema, input);
  return serializable(tx => tx.workflow.create({ data }));
}

export async function updateWorkflow(id: string, input: unknown) {
  const data = parseInput(workflowSchema.partial().refine(v => Object.keys(v).length > 0), input);
  return serializable(async tx => {
    const result = await tx.workflow.update({ where: { id }, data });
    // Polling must refresh tags after renaming or recoloring a workflow.
    await tx.card.updateMany({ where: { aiActivities: { some: { workflowTagId: id } } }, data: { updatedAt: new Date() } });
    return result;
  });
}
