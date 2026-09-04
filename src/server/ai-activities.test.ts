import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  card: { findUnique: vi.fn() },
  aiActivity: { upsert: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { recordAiActivity } from "./ai-activities";

describe("recordAiActivity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registra uma atividade da IA vinculada ao card", async () => {
    dbMock.card.findUnique.mockResolvedValue({ id: "card1" });
    dbMock.aiActivity.upsert.mockResolvedValue({ id: "activity1", type: "ANALYZED" });

    await recordAiActivity({ cardId: "card1", type: "ANALYZED", idempotencyKey: "run1:analyzed" });

    expect(dbMock.aiActivity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: "run1:analyzed" },
      create: expect.objectContaining({ cardId: "card1", type: "ANALYZED" }),
      update: {},
    }));
  });

  it("rejeita card inexistente", async () => {
    dbMock.card.findUnique.mockResolvedValue(null);

    await expect(recordAiActivity({ cardId: "missing", type: "TESTED", idempotencyKey: "run1:tested" }))
      .rejects.toThrow("Card não encontrado: missing");
  });
});
