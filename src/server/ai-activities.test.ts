import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => {
  const mock = {
    card: { findUnique: vi.fn(), update: vi.fn() },
    aiActivity: { findUnique: vi.fn(), create: vi.fn() },
    workflowDefault: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  };
  mock.$transaction.mockImplementation((fn) => fn(mock));
  return mock;
});
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { recordAiActivity } from "./ai-activities";

describe("recordAiActivity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registra uma atividade da IA vinculada ao card", async () => {
    dbMock.card.findUnique.mockResolvedValue({ id: "card1" });
    dbMock.aiActivity.create.mockImplementation(({ data }) => ({ id: "activity1", ...data }));

    const result = await recordAiActivity({ cardId: "card1", type: "ANALYZED", idempotencyKey: "run1:analyzed" });

    expect(result).toMatchObject({ cardId: "card1", type: "ANALYZED", idempotencyKey: "run1:analyzed", status: "COMPLETED" });
    expect(result.finishedAt).toBeInstanceOf(Date);
  });

  it("rejeita card inexistente", async () => {
    dbMock.card.findUnique.mockResolvedValue(null);

    await expect(recordAiActivity({ cardId: "missing", type: "TESTED", idempotencyKey: "run1:tested" }))
      .rejects.toThrow("Card não encontrado: missing");
  });
});
