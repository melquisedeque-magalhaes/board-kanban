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

    expect(report.aiActivities).toEqual({ analyzed: 2, developed: 1, tested: 2 });
    expect(dbMock.aiActivity.findMany).toHaveBeenCalledWith({
      select: { cardId: true, type: true }, distinct: ["cardId", "type"],
    });
  });
});
