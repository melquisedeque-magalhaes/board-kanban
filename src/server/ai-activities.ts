import { db } from "@/lib/db";
import type { AiActivityType } from "@prisma/client";

export interface RecordAiActivityInput {
  cardId: string;
  type: AiActivityType;
  idempotencyKey: string;
  workflowId?: string;
  runId?: string;
}

export async function recordAiActivity(input: RecordAiActivityInput) {
  const card = await db.card.findUnique({ where: { id: input.cardId }, select: { id: true } });
  if (!card) throw new Error(`Card não encontrado: ${input.cardId}`);
  return db.aiActivity.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      cardId: input.cardId, type: input.type, idempotencyKey: input.idempotencyKey,
      workflowId: input.workflowId, runId: input.runId,
    },
    update: {},
  });
}
