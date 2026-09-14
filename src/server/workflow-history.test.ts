import { beforeEach, describe, expect, it, vi } from "vitest";

// Only persistence is replaced; validation, identity and transitions run in production services.
const state = vi.hoisted(() => ({ workflows: [] as Record<string, unknown>[], activities: [] as Record<string, unknown>[] }));
const matches = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);
vi.mock("@/lib/db", () => {
  const db = {
    workflow: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => state.workflows.find(w => matches(w, where)) ?? null,
      findMany: async () => state.workflows,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (data.externalId && state.workflows.some(w => w.externalId === data.externalId)) throw { code: "P2002" };
        const row = { id: `w${state.workflows.length + 1}`, active: true, externalId: null, ...data };
        state.workflows.push(row); return row;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const row = state.workflows.find(w => matches(w, where));
        if (!row) throw { code: "P2025" }; Object.assign(row, data); return row;
      },
    },
    card: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === "missing" ? null : { id: where.id },
      update: async () => ({}), updateMany: async () => ({ count: 1 }),
    },
    aiActivity: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => state.activities.find(a => matches(a, where)) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => state.activities.find(a => matches(a, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => state.activities.filter(a => matches(a, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.activities.some(a => a.idempotencyKey === data.idempotencyKey)) throw { code: "P2002" };
        const row = { id: `a${state.activities.length + 1}`, workflowId: null, workflowTagId: null, runId: null, ...data };
        state.activities.push(row); return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = state.activities.filter(a => matches(a, where)); rows.forEach(a => Object.assign(a, data)); return { count: rows.length };
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db };
});

import { createWorkflow, updateWorkflow } from "./workflows";
import { startAiActivity, finishAiActivity, recordAiActivity, listAiActivities } from "./ai-activities";

describe("histórico de workflows", () => {
  beforeEach(() => { state.workflows.length = 0; state.activities.length = 0; });
  const workflow = () => createWorkflow({ name: "Implementação", color: "#445566", externalId: "84" });
  const input = { cardId: "card1", workflowTagId: "w1", type: "DEVELOPED" as const, idempotencyKey: "run-1", runId: "run1" };

  it("cadastra workflows dinâmicos e rejeita dados inválidos e externalId duplicado", async () => {
    const w = await workflow();
    expect(w).toMatchObject({ name: "Implementação", active: true, color: "#445566", externalId: "84" });
    await expect(workflow()).rejects.toMatchObject({ status: 409 });
    await expect(createWorkflow({ name: " ", color: "#123456" })).rejects.toMatchObject({ status: 400 });
    await expect(createWorkflow({ name: "QA", color: "red;position:absolute" })).rejects.toMatchObject({ status: 400 });
  });
  it("persiste início, snapshot e término sem duplicar em retry", async () => {
    await workflow();
    const a = await startAiActivity(input);
    expect(a).toMatchObject({ status: "RUNNING", workflowName: "Implementação", workflowId: "84", cardId: "card1", runId: "run1" });
    expect(a.startedAt).toBeInstanceOf(Date);
    await startAiActivity(input);
    expect(state.activities).toHaveLength(1);
    await finishAiActivity("card1", a.id, "COMPLETED");
    const result = await finishAiActivity("card1", a.id, "COMPLETED");
    expect(result).toMatchObject({ status: "COMPLETED" });
    expect(result.finishedAt).toBeInstanceOf(Date);
    await expect(finishAiActivity("card1", a.id, "FAILED")).rejects.toMatchObject({ status: 409 });
  });
  it("conflito de identidade não substitui card nem atividade", async () => {
    await workflow(); await startAiActivity(input);
    await expect(startAiActivity({ ...input, cardId: "card2" })).rejects.toMatchObject({ status: 409 });
    await expect(startAiActivity({ ...input, type: "TESTED" })).rejects.toMatchObject({ status: 409 });
    await expect(startAiActivity({ ...input, runId: "another-run" })).rejects.toMatchObject({ status: 409 });
    await expect(startAiActivity({ ...input, workflowTagId: "another-workflow" })).rejects.toMatchObject({ status: 409 });
    expect(state.activities[0]).toMatchObject({ cardId: "card1", type: "DEVELOPED", status: "RUNNING" });
  });
  it("desativação impede novo início mas permite finalizar e consultar histórico", async () => {
    await workflow(); const a = await startAiActivity(input);
    await updateWorkflow("w1", { active: false, name: "Implementação v2" });
    await expect(startAiActivity({ ...input, idempotencyKey: "run2" })).rejects.toMatchObject({ status: 409 });
    const done = await finishAiActivity("card1", a.id, "COMPLETED");
    expect(done).toMatchObject({ status: "COMPLETED", workflowName: "Implementação" });
    expect(await listAiActivities("card1")).toHaveLength(1);
  });
  it("finalizar uma execução não encerra outra nem aceita outro card", async () => {
    await workflow(); const a = await startAiActivity(input);
    await startAiActivity({ ...input, idempotencyKey: "run2", runId: "run2" });
    await expect(finishAiActivity("card2", a.id, "COMPLETED")).rejects.toMatchObject({ status: 404 });
    await finishAiActivity("card1", a.id, "CANCELLED");
    expect(state.activities.map(a => a.status)).toEqual(["CANCELLED", "RUNNING"]);
  });
  it("mantém conclusão legada sem workflow e permite novas atividades", async () => {
    const old = { cardId: "card1", type: "CREATED" as const, idempotencyKey: "legacy" };
    expect(await recordAiActivity(old)).toMatchObject({ status: "COMPLETED", workflowTagId: null });
    await recordAiActivity(old);
    expect(state.activities).toHaveLength(1);
    await expect(recordAiActivity({ ...old, cardId: "card2" })).rejects.toMatchObject({ status: 409 });
  });
  it("rejeita card e workflow desconhecidos e status inicial inválido", async () => {
    await workflow();
    await expect(startAiActivity({ ...input, cardId: "missing" })).rejects.toMatchObject({ status: 404 });
    await expect(startAiActivity({ ...input, workflowTagId: "missing" })).rejects.toMatchObject({ status: 404 });
    await expect(startAiActivity({ ...input, status: "FAILED" as "RUNNING" })).rejects.toMatchObject({ status: 400 });
  });
  it("chamada legada sem workflow não assume identidade de participação cadastrada", async () => {
    await createWorkflow({ name: "QA", color: "#123456" });
    await startAiActivity({ ...input, status: "COMPLETED" });
    await expect(recordAiActivity({ cardId: input.cardId, type: input.type, runId: input.runId, idempotencyKey: input.idempotencyKey })).rejects.toMatchObject({ status: 409 });
  });
});
