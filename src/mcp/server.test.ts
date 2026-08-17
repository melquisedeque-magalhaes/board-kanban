import { describe, it, expect, vi } from "vitest";
const createCard = vi.fn().mockResolvedValue({ id: "new" });
const updateCard = vi.fn().mockResolvedValue({ id: "card1" });
const moveCard = vi.fn().mockResolvedValue({ id: "card1" });
const addComment = vi.fn().mockResolvedValue({ id: "comment1" });
const resolveUserIds = vi.fn().mockResolvedValue(["u1"]);
vi.mock("@/server/cards", () => ({
  listColumns: vi.fn().mockResolvedValue([{ id: "c1", name: "A Fazer" }]),
  listCards: vi.fn(),
  getCard: vi.fn(),
  createCard: (...args: unknown[]) => createCard(...args),
  updateCard: (...args: unknown[]) => updateCard(...args),
  deleteCard: vi.fn(),
  archiveCard: vi.fn(),
  unarchiveCard: vi.fn(),
  listArchivedCards: vi.fn(),
  assignCard: vi.fn(),
  unassignCard: vi.fn(),
  moveCard: (...args: unknown[]) => moveCard(...args),
  addComment: (...args: unknown[]) => addComment(...args),
  updateComment: vi.fn(),
  addAttachment: vi.fn(),
  listAttachments: vi.fn(),
  listUsers: vi.fn(),
  listLabels: vi.fn(),
  resolveUserIds: (...args: unknown[]) => resolveUserIds(...args),
}));
import { buildMcpServer } from "./server";

describe("buildMcpServer", () => {
  it("registra as tools sem throw", () => {
    const s = buildMcpServer();
    expect(s).toBeTruthy();
  });

  it("registra exatamente as 18 tools esperadas", () => {
    const s = buildMcpServer();
    const registered = (s as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(registered).sort()).toEqual(
      [
        "add_attachment", "add_comment", "archive_card", "assign_card", "create_card",
        "get_card", "get_delivery_report", "list_archived_cards", "list_attachments", "list_cards",
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

  const callback = (name: "update_card" | "move_card" | "add_comment") => {
    const s = buildMcpServer();
    const tools = (s as unknown as { _registeredTools: Record<string, Tool> })._registeredTools;
    return tools[name].handler;
  };

  it("create_card: createdBy vira 'Solicitado por' quando não há requestedBy", async () => {
    createCard.mockClear();
    await createCallback()({ columnName: "A Fazer", title: "novo", createdBy: "me" });
    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ requestedBy: "me" }));
  });

  it("create_card: requestedBy explícito ganha do createdBy", async () => {
    createCard.mockClear();
    await createCallback()({ columnName: "A Fazer", title: "novo", createdBy: "me", requestedBy: "outro" });
    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ requestedBy: "outro" }));
  });

  it("create_card: sem createdBy nem requestedBy, não injeta solicitante", async () => {
    createCard.mockClear();
    await createCallback()({ columnName: "A Fazer", title: "novo" });
    expect(createCard).toHaveBeenCalledWith(expect.not.objectContaining({ requestedBy: expect.anything() }));
  });

  it("update_card encaminha actor separado dos campos editáveis", async () => {
    await callback("update_card")({ id: "card1", blocker: "AVISO", actor: "Giovanni" });

    expect(updateCard).toHaveBeenCalledWith("card1", { blocker: "AVISO" }, "Giovanni");
  });

  it("move_card encaminha actor", async () => {
    await callback("move_card")({ id: "card1", columnId: "c2", actor: "Giovanni" });

    expect(moveCard).toHaveBeenCalledWith("card1", "c2", undefined, "Giovanni");
  });

  it("add_comment resolve actor e encaminha o id do autor", async () => {
    await callback("add_comment")({ cardId: "card1", body: "Comentário", actor: "Giovanni" });

    expect(resolveUserIds).toHaveBeenCalledWith(["Giovanni"]);
    expect(addComment).toHaveBeenCalledWith("card1", "Comentário", "u1");
  });
});
