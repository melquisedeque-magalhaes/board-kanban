import { db } from "@/lib/db";
import type { AiActivity, AiActivityType, Prisma } from "@prisma/client";
import { z } from "zod";
import { DomainError, parseInput, serializable } from "./workflows";

export const activityTypes = ["CREATED", "ANALYZED", "DEVELOPED", "TESTED", "REVIEWED"] as const;
const identity = z.string().trim().min(1).max(200);
const activitySchema = z.object({
  cardId: identity, type: z.enum(activityTypes), idempotencyKey: identity,
  workflowId: identity.optional(), runId: identity.optional(),
});
const startSchema = activitySchema.omit({ workflowId: true }).extend({
  workflowTagId: identity,
  status: z.enum(["RUNNING", "COMPLETED"]).default("RUNNING"),
}).strict();

export interface RecordAiActivityInput {
  cardId: string;
  type: AiActivityType;
  idempotencyKey: string;
  workflowId?: string;
  runId?: string;
}

const include = { workflow: true } as const;
async function requireCard(tx: Prisma.TransactionClient, cardId: string) {
  if (!await tx.card.findUnique({ where: { id: cardId }, select: { id: true } })) {
    throw new DomainError(`Card não encontrado: ${cardId}`, 404);
  }
}

function checkIdentity(existing: AiActivity, input: RecordAiActivityInput & { workflowTagId?: string; status?: string }) {
  if (existing.cardId !== input.cardId || existing.type !== input.type || existing.runId !== (input.runId ?? null)
    || (input.workflowTagId && existing.workflowAssigned)
    || (!input.workflowTagId && !input.workflowId && existing.workflowTagId !== null && !existing.workflowAssigned)
    || (input.workflowTagId ? existing.workflowTagId !== input.workflowTagId : existing.workflowId !== (input.workflowId ?? null))
    || (input.status && Boolean(existing.startedAt) !== (input.status === "RUNNING"))) {
    throw new DomainError("Chave de idempotência já usada para outra operação", 409);
  }
}

export async function recordAiActivity(raw: RecordAiActivityInput) {
  const input = parseInput(activitySchema.strict(), raw);
  return serializable(async tx => {
    await requireCard(tx, input.cardId);
    const existing = await tx.aiActivity.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
    if (existing) {
      checkIdentity(existing, input);
      if (existing.startedAt) throw new DomainError("Use a conclusão da execução para uma atividade iniciada", 409);
      return existing;
    }
    const defaultWorkflow = !input.workflowId
      ? (await tx.workflowDefault.findUnique({ where: { type: input.type }, include: { workflow: true } }))?.workflow
      : null;
    const workflow = input.workflowId
      ? await tx.workflow.findUnique({ where: { externalId: input.workflowId } })
      : defaultWorkflow?.active ? defaultWorkflow : null;
    if (input.workflowId && workflow && !workflow.active) throw new DomainError("Workflow desativado", 409);
    const result = await tx.aiActivity.create({
      data: { ...input, status: "COMPLETED", finishedAt: new Date(), workflowTagId: workflow?.id ?? null, workflowName: workflow?.name ?? null,
        workflowAssigned: !input.workflowId && Boolean(workflow) }, include,
    });
    await tx.card.update({ where: { id: input.cardId }, data: { updatedAt: new Date() } });
    return result;
  }, true);
}

export async function startAiActivity(raw: unknown) {
  const input = parseInput(startSchema, raw);
  return serializable(async tx => {
    await requireCard(tx, input.cardId);
    const existing = await tx.aiActivity.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
    if (existing) { checkIdentity(existing, input); return existing; }
    const workflow = await tx.workflow.findUnique({ where: { id: input.workflowTagId } });
    if (!workflow) throw new DomainError("Workflow não encontrado", 404);
    if (!workflow.active) throw new DomainError("Workflow desativado", 409);
    const now = new Date();
    const result = await tx.aiActivity.create({ data: {
      ...input, workflowId: workflow.externalId, workflowName: workflow.name,
      startedAt: input.status === "RUNNING" ? now : null,
      finishedAt: input.status === "COMPLETED" ? now : null,
    }, include });
    await tx.card.update({ where: { id: input.cardId }, data: { updatedAt: now } });
    return result;
  }, true);
}

export async function finishAiActivity(cardId: string, id: string, raw: "COMPLETED" | "FAILED" | "CANCELLED") {
  const status = parseInput(z.enum(["COMPLETED", "FAILED", "CANCELLED"]), raw);
  return serializable(async tx => {
    const existing = await tx.aiActivity.findUnique({ where: { id }, include });
    if (!existing || existing.cardId !== cardId) throw new DomainError("Atividade não encontrada", 404);
    if (existing.status === status) return existing;
    if (existing.status !== "RUNNING") throw new DomainError("Atividade já encerrada com outro resultado", 409);
    const now = new Date();
    const changed = await tx.aiActivity.updateMany({ where: { id, cardId, status: "RUNNING" }, data: { status, finishedAt: now } });
    if (changed.count !== 1) throw new DomainError("Atividade alterada simultaneamente; tente novamente", 409);
    await tx.card.update({ where: { id: cardId }, data: { updatedAt: now } });
    return (await tx.aiActivity.findUnique({ where: { id }, include }))!;
  });
}

export async function listAiActivities(cardId: string) {
  await requireCard(db, cardId);
  return db.aiActivity.findMany({ where: { cardId }, include, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}

export async function linkAiActivityWorkflow(cardId: string, id: string, raw: unknown) {
  const input = parseInput(z.object({ workflowTagId: identity, applyToAll: z.boolean().default(false) }).strict(), raw);
  return serializable(async tx => {
    const activity = await tx.aiActivity.findUnique({ where: { id }, include });
    if (!activity || activity.cardId !== cardId) throw new DomainError("Atividade não encontrada", 404);
    const workflow = await tx.workflow.findUnique({ where: { id: input.workflowTagId } });
    if (!workflow) throw new DomainError("Workflow não encontrado", 404);
    if (!workflow.active) throw new DomainError("Workflow desativado", 409);
    const unassigned = activity.workflowTagId === null && activity.workflowId === null && activity.workflowName === null;
    const sameAssignment = activity.workflowAssigned && activity.workflowTagId === workflow.id;
    if (!unassigned && !sameAssignment) throw new DomainError("Atividade já possui identificação de workflow", 409);

    // O filtro de ausência de identidade protege inclusive IDs externos não cadastrados.
    const where = {
      ...(input.applyToAll ? { type: activity.type } : { id, cardId }),
      workflowTagId: null, workflowId: null, workflowName: null,
    };
    const now = new Date();
    // Atualiza os cards antes de preencher os vínculos, enquanto o filtro identifica o mesmo conjunto.
    await tx.card.updateMany({ where: { aiActivities: { some: where } }, data: { updatedAt: now } });
    const updated = await tx.aiActivity.updateMany({ where, data: {
      workflowTagId: workflow.id, workflowName: workflow.name, workflowAssigned: true,
    } });
    if (input.applyToAll) {
      await tx.workflowDefault.upsert({ where: { type: activity.type },
        create: { type: activity.type, workflowTagId: workflow.id },
        update: { workflowTagId: workflow.id },
      });
    }
    return {
      activity: (await tx.aiActivity.findUnique({ where: { id }, include }))!,
      updatedCount: updated.count, defaultApplied: input.applyToAll,
    };
  });
}
