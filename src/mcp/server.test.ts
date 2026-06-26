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

  it("registra exatamente as 9 tools esperadas", () => {
    const s = buildMcpServer();
    const registered = (s as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(registered).sort()).toEqual(
      [
        "add_comment", "create_card", "get_card", "list_cards", "list_columns",
        "list_labels", "list_users", "move_card", "update_card",
      ].sort(),
    );
  });
});
