import { describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  column: { findMany: vi.fn().mockResolvedValue([]) },
  user: { findMany: vi.fn().mockResolvedValue([]) },
  card: { findMany: vi.fn().mockResolvedValue([]) },
  aiActivity: { findMany: vi.fn().mockResolvedValue([
    { cardId: "card1", type: "ANALYZED" },
    { cardId: "card2", type: "ANALYZED" },
    { cardId: "card3", type: "DEVELOPED" },
    { cardId: "card4", type: "TESTED" },
    { cardId: "card5", type: "TESTED" },
  ]) },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getDeliveryReport } from "./reports";

describe("getDeliveryReport", () => {
  it("inclui contagem de atividades da IA por tipo", async () => {
    const report = await getDeliveryReport();

    expect(report.aiActivities).toEqual({ created: 0, analyzed: 2, developed: 1, tested: 2, reviewed: 0, totalCards: 5 });
    expect(dbMock.aiActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "COMPLETED" } }));
    expect(report.aiByWorkflow[0]).toMatchObject({ workflowId: null, name: "Workflow não informado", totalCards: 5 });
  });

  it("deduplica cards globalmente e por workflow, preservando atribuição legada", async () => {
    const workflow = { id: "w1", name: "Dev", color: "#112233" };
    dbMock.aiActivity.findMany.mockResolvedValueOnce([
      { cardId: "c1", type: "CREATED", workflowTagId: "w1", workflow },
      { cardId: "c1", type: "DEVELOPED", workflowTagId: "w1", workflow },
      { cardId: "c1", type: "DEVELOPED", workflowTagId: "w1", workflow },
      { cardId: "c1", type: "DEVELOPED", workflowId: "legacy-dev" },
      { cardId: "c2", type: "REVIEWED" },
    ]);
    const report = await getDeliveryReport();
    expect(report.aiActivities).toEqual({ created: 1, analyzed: 0, developed: 1, tested: 0, reviewed: 1, totalCards: 2 });
    expect(report.aiByWorkflow).toEqual(expect.arrayContaining([
      expect.objectContaining({ workflowId: "w1", name: "Dev", created: 1, developed: 1, totalCards: 1 }),
      expect.objectContaining({ workflowId: "legacy-dev", developed: 1, totalCards: 1 }),
      expect.objectContaining({ workflowId: null, reviewed: 1, totalCards: 1 }),
    ]));
  });
});
