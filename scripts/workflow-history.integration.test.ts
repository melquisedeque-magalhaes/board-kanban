import { afterEach, beforeEach, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { createWorkflow, updateWorkflow } from "../src/server/workflows";
import { finishAiActivity, startAiActivity, recordAiActivity, linkAiActivityWorkflow } from "../src/server/ai-activities";
import { getDeliveryReport } from "../src/server/reports";

// Opt-in: this suite creates fixtures only in the dedicated disposable local database.
const enabled = process.env.WORKFLOW_DB_TEST === "1";
let scope: string;
let cardId: string;
let workflowId: string;
beforeEach(async () => {
  if (!enabled) return;
  scope = `integration-${crypto.randomUUID()}`;
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55469" || url.pathname !== "/kanban") throw new Error("Use o banco isolado de TI-669 em 127.0.0.1:55469/kanban");
  const board = await db.board.create({ data: { id: scope, name: scope, columns: { create: { name: "A Fazer", position: 0 } } }, include: { columns: true } });
  const card = await db.card.create({ data: { columnId: board.columns[0].id, title: scope, position: 0 } });
  cardId = card.id;
  workflowId = (await createWorkflow({ name: scope, color: "#abcdef", externalId: scope })).id;
});
afterEach(async () => {
  if (!enabled || !cardId) return;
  await db.board.delete({ where: { id: scope } });
  await db.workflowDefault.deleteMany({ where: { workflowTagId: workflowId } });
  if (workflowId) await db.workflow.delete({ where: { id: workflowId } });
  await db.$disconnect();
});

it.runIf(enabled)("vínculo visual aplica histórico e padrão sem sobrescrever explícitos nem duplicar métricas", async () => {
  await updateWorkflow(workflowId, { active: true });
  const input = { cardId, type: "ANALYZED" as const, idempotencyKey: `${scope}-analysis` };
  const a = await recordAiActivity(input);
  const card = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  const secondCard = await db.card.create({ data: { columnId: card.columnId, title: "Outro card arquivado", position: 1, archivedAt: new Date() } });
  const b = await recordAiActivity({ ...input, cardId: secondCard.id, idempotencyKey: `${scope}-analysis-2` });
  const explicit = await recordAiActivity({ ...input, workflowId: "external-unregistered", idempotencyKey: `${scope}-explicit` });
  const typed = await recordAiActivity({ ...input, type: "TESTED", idempotencyKey: `${scope}-tested` });
  const named = await db.aiActivity.create({ data: { cardId, type: "ANALYZED", idempotencyKey: `${scope}-named`, workflowName: "Nome legado" } });
  const before = (await getDeliveryReport()).aiActivities;
  await expect(linkAiActivityWorkflow(secondCard.id, a.id, { workflowTagId: workflowId })).rejects.toMatchObject({ status: 404 });
  await expect(linkAiActivityWorkflow(cardId, a.id, { workflowTagId: "missing" })).rejects.toMatchObject({ status: 404 });
  await expect(linkAiActivityWorkflow(cardId, a.id, { workflowTagId: workflowId, applyToAll: "yes" })).rejects.toMatchObject({ status: 400 });
  const result = await linkAiActivityWorkflow(cardId, a.id, { workflowTagId: workflowId, applyToAll: true });
  expect(result).toMatchObject({ updatedCount: 2, defaultApplied: true, activity: { id: a.id, workflowTagId: workflowId, status: "COMPLETED" } });
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: a.id } })).createdAt).toEqual(a.createdAt);
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: b.id } })).workflowTagId).toBe(workflowId);
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: explicit.id } })).workflowId).toBe("external-unregistered");
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: explicit.id } })).workflowTagId).toBeNull();
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: typed.id } })).workflowTagId).toBeNull();
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: named.id } })).workflowTagId).toBeNull();
  expect((await getDeliveryReport()).aiActivities).toEqual(before);
  expect((await getDeliveryReport()).aiByWorkflow.find(w => w.workflowId === workflowId)?.analyzed).toBe(2);
  expect(await recordAiActivity(input)).toMatchObject({ id: a.id, workflowTagId: workflowId });
  const retry = await linkAiActivityWorkflow(cardId, a.id, { workflowTagId: workflowId, applyToAll: true });
  expect(retry.updatedCount).toBe(0);
  const future = { ...input, idempotencyKey: `${scope}-future` };
  const futureActivity = await recordAiActivity(future);
  expect(futureActivity).toMatchObject({ workflowTagId: workflowId, workflowAssigned: true, workflowId: null });
  expect((await recordAiActivity(future)).id).toBe(futureActivity.id);
  const futureExplicit = await recordAiActivity({ ...future, idempotencyKey: `${scope}-future-explicit`, workflowId: "external-2" });
  expect(futureExplicit.workflowTagId).toBeNull();
  await expect(linkAiActivityWorkflow(cardId, explicit.id, { workflowTagId: workflowId })).rejects.toMatchObject({ status: 409 });
  await updateWorkflow(workflowId, { active: false });
  const inactive = await recordAiActivity({ ...future, idempotencyKey: `${scope}-inactive-default` });
  expect(inactive.workflowTagId).toBeNull();
  await expect(linkAiActivityWorkflow(cardId, typed.id, { workflowTagId: workflowId })).rejects.toMatchObject({ status: 409 });
});

it.runIf(enabled)("vínculo individual preserva outras atividades e identidade original nos retries", async () => {
  await updateWorkflow(workflowId, { active: true });
  const input = { cardId, type: "REVIEWED" as const, idempotencyKey: `${scope}-review` };
  const a = await recordAiActivity(input);
  const other = await recordAiActivity({ ...input, idempotencyKey: `${scope}-review-other` });
  const linked = await linkAiActivityWorkflow(cardId, a.id, { workflowTagId: workflowId });
  expect(linked).toMatchObject({ updatedCount: 1, defaultApplied: false });
  expect((await db.aiActivity.findUniqueOrThrow({ where: { id: other.id } })).workflowTagId).toBeNull();
  expect(await db.workflowDefault.findUnique({ where: { type: "REVIEWED" } })).toBeNull();
  expect((await recordAiActivity(input)).id).toBe(a.id);
  await expect(startAiActivity({ ...input, workflowTagId: workflowId, status: "COMPLETED" })).rejects.toMatchObject({ status: 409 });
  await expect(recordAiActivity({ ...input, workflowId: scope })).rejects.toMatchObject({ status: 409 });
  const start = await startAiActivity({ ...input, idempotencyKey: `${scope}-explicit-start`, workflowTagId: workflowId, status: "COMPLETED" });
  await expect(recordAiActivity({ ...input, idempotencyKey: start.idempotencyKey })).rejects.toMatchObject({ status: 409 });
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
