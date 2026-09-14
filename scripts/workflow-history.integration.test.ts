import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { createWorkflow, updateWorkflow } from "../src/server/workflows";
import { finishAiActivity, startAiActivity, recordAiActivity } from "../src/server/ai-activities";
import { getDeliveryReport } from "../src/server/reports";

// Opt-in: this suite creates fixtures only in the dedicated disposable local database.
const enabled = process.env.WORKFLOW_DB_TEST === "1";
const scope = `integration-${crypto.randomUUID()}`;
let cardId: string;
let workflowId: string;
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55469" || url.pathname !== "/kanban") throw new Error("Use o banco isolado de TI-669 em 127.0.0.1:55469/kanban");
  const board = await db.board.create({ data: { id: scope, name: scope, columns: { create: { name: "A Fazer", position: 0 } } }, include: { columns: true } });
  const card = await db.card.create({ data: { columnId: board.columns[0].id, title: scope, position: 0 } });
  cardId = card.id;
  workflowId = (await createWorkflow({ name: scope, color: "#abcdef", externalId: scope })).id;
});
afterAll(async () => {
  if (!enabled || !cardId) return;
  await db.board.delete({ where: { id: scope } });
  if (workflowId) await db.workflow.delete({ where: { id: workflowId } });
  await db.$disconnect();
});

it.runIf(enabled)("PostgreSQL: concorrência, retry, snapshot e métricas observam estado persistido", async () => {
  const base = { cardId, workflowTagId: workflowId, type: "DEVELOPED" as const, idempotencyKey: scope };
  const parallel = await Promise.all([startAiActivity(base), startAiActivity(base)]);
  expect(parallel[0].id).toBe(parallel[1].id);
  expect(await db.aiActivity.count({ where: { cardId } })).toBe(1);
  const other = await startAiActivity({ ...base, idempotencyKey: `${scope}-2` });
  await Promise.all([finishAiActivity(cardId, parallel[0].id, "COMPLETED"), finishAiActivity(cardId, parallel[0].id, "COMPLETED")]);
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("RUNNING");
  const before = (await getDeliveryReport()).aiActivities;
  await finishAiActivity(cardId, other.id, "COMPLETED");
  expect((await getDeliveryReport()).aiActivities).toEqual(before);
  await updateWorkflow(workflowId, { active: false, name: `${scope}-renamed` });
  await expect(startAiActivity({ ...base, idempotencyKey: `${scope}-3` })).rejects.toMatchObject({ status: 409 });
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: other.id } })).workflowName).toBe(scope);
  await db.card.update({ where: { id: cardId }, data: { archivedAt: new Date(), bot: false } });
  expect((await getDeliveryReport()).aiActivities).toEqual(before);
  const legacy = { cardId, type: "CREATED" as const, idempotencyKey: `${scope}-legacy` };
  await recordAiActivity(legacy); await recordAiActivity(legacy);
  const after = (await getDeliveryReport()).aiActivities;
  expect(after.created).toBe(before.created + 1);
  expect(after.totalCards).toBe(before.totalCards);
  await expect(recordAiActivity({ ...legacy, type: "TESTED" })).rejects.toMatchObject({ status: 409 });
});
