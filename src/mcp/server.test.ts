import { describe, it, expect, vi } from "vitest";
vi.mock("@/server/cards", () => ({
  listColumns: vi.fn().mockResolvedValue([{ id: "c1", name: "A Fazer" }]),
  listCards: vi.fn(),
  getCard: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  moveCard: vi.fn(),
  addComment: vi.fn(),
  listUsers: vi.fn(),
  listLabels: vi.fn(),
  resolveUserIds: vi.fn(),
}));
import { buildMcpServer } from "./server";

describe("buildMcpServer", () => {
  it("registra as tools sem throw", () => {
    const s = buildMcpServer();
    expect(s).toBeTruthy();
  });
});
