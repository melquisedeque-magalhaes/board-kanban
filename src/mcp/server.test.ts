import { describe, it, expect, vi } from "vitest";
const createCard = vi.fn().mockResolvedValue({ id: "new" });
vi.mock("@/server/cards", () => ({
  listColumns: vi.fn().mockResolvedValue([{ id: "c1", name: "A Fazer" }]),
  listCards: vi.fn(),
  getCard: vi.fn(),
  createCard: (...args: unknown[]) => createCard(...args),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  archiveCard: vi.fn(),
  unarchiveCard: vi.fn(),
  listArchivedCards: vi.fn(),
  assignCard: vi.fn(),
  unassignCard: vi.fn(),
  moveCard: vi.fn(),
  addComment: vi.fn(),
  updateComment: vi.fn(),
  addAttachment: vi.fn(),
  listAttachments: vi.fn(),
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

  it("registra exatamente as 17 tools esperadas", () => {
    const s = buildMcpServer();
    const registered = (s as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(registered).sort()).toEqual(
      [
        "add_attachment", "add_comment", "archive_card", "assign_card", "create_card",
        "get_card", "list_archived_cards", "list_attachments", "list_cards",
        "list_columns", "list_labels", "list_users", "move_card", "unarchive_card",
        "unassign_card", "update_card", "update_comment",
      ].sort(),
    );
  });

  type Tool = { handler: (a: Record<string, unknown>) => Promise<unknown> };
  const createCallback = () => {
    const s = buildMcpServer();
    const tools = (s as unknown as { _registeredTools: Record<string, Tool> })._registeredTools;
    return tools.create_card.handler;
  };

  it("create_card: createdBy vira responsável quando não há assignees", async () => {
    createCard.mockClear();
    await createCallback()({ columnName: "A Fazer", title: "novo", createdBy: "me" });
    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ assignees: ["me"] }));
  });

  it("create_card: assignees explícitos ganham do createdBy", async () => {
    createCard.mockClear();
    await createCallback()({ columnName: "A Fazer", title: "novo", createdBy: "me", assignees: ["outro"] });
    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ assignees: ["outro"] }));
  });

  it("create_card: sem createdBy nem assignees, não injeta responsável", async () => {
    createCard.mockClear();
    await createCallback()({ columnName: "A Fazer", title: "novo" });
    expect(createCard).toHaveBeenCalledWith(expect.not.objectContaining({ assignees: expect.anything() }));
  });
});
