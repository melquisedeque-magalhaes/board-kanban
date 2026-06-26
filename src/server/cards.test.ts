import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  column: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  card: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findMany: vi.fn() },
  label: { findMany: vi.fn() },
  comment: { create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { resolveColumnId, moveCard } from "./cards";

beforeEach(() => vi.clearAllMocks());

describe("resolveColumnId", () => {
  it("usa columnId direto se válido", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    expect(await resolveColumnId({ columnId: "c1" })).toBe("c1");
  });
  it("resolve por nome", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "c2" });
    expect(await resolveColumnId({ columnName: "Em Andamento" })).toBe("c2");
  });
  it("throw se não achar", async () => {
    dbMock.column.findUnique.mockResolvedValue(null);
    dbMock.column.findFirst.mockResolvedValue(null);
    await expect(resolveColumnId({ columnName: "X" })).rejects.toThrow();
  });
});

describe("moveCard", () => {
  it("calcula position no fim quando omitida", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 2000 });
    const r = await moveCard("card1", "c1", undefined);
    expect(dbMock.card.update).toHaveBeenCalled();
    expect(r.position).toBe(2000);
  });
});
