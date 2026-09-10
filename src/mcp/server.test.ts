import { describe, it, expect, vi } from "vitest";
const createCard = vi.fn().mockResolvedValue({ id: "new" });
const updateCard = vi.fn().mockResolvedValue({ id: "card1" });
const moveCard = vi.fn().mockResolvedValue({ id: "card1" });
const addComment = vi.fn().mockResolvedValue({ id: "comment1" });
const resolveUserIds = vi.fn().mockResolvedValue(["u1"]);
const setCardBot = vi.fn().mockResolvedValue({ id: "card1", bot: true });
const recordAiActivity = vi.fn().mockResolvedValue({ id: "activity1", type: "ANALYZED" });
const listColumnsSummary = vi.fn().mockResolvedValue([{ id: "c1", name: "A Fazer", cardCount: 3 }]);
const listCardsSummary = vi.fn().mockResolvedValue({ total: 0, offset: 0, limit: 50, hasMore: false, cards: [] });
const listArchivedCardsSummary = vi.fn().mockResolvedValue({ total: 0, offset: 0, limit: 50, hasMore: false, cards: [] });
vi.mock("@/server/cards", () => ({
  listColumns: vi.fn().mockResolvedValue([{ id: "c1", name: "A Fazer" }]),
  listColumnsSummary: (...args: unknown[]) => listColumnsSummary(...args),
  listCards: vi.fn(),
  listCardsSummary: (...args: unknown[]) => listCardsSummary(...args),
  listArchivedCardsSummary: (...args: unknown[]) => listArchivedCardsSummary(...args),
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
  setCardBot: (...args: unknown[]) => setCardBot(...args),
  addComment: (...args: unknown[]) => addComment(...args),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  getCardByCode: vi.fn(),
  normalizeCardCode: (code: string) => code,
  addAttachment: vi.fn(),
  listAttachments: vi.fn(),
  listUsers: vi.fn(),
  listLabels: vi.fn(),
  resolveUserIds: (...args: unknown[]) => resolveUserIds(...args),
  // As descrições de list_cards/list_archived_cards citam os limites reais, para
  // o agente não descobrir a paginação por tentativa e erro.
  MCP_LIST_DEFAULT_LIMIT: 50,
  MCP_LIST_MAX_LIMIT: 200,
}));
vi.mock("@/server/columns", () => ({
  createColumn: vi.fn(),
  updateColumn: vi.fn(),
  moveColumn: vi.fn(),
  deleteColumn: vi.fn(),
}));
vi.mock("@/server/ai-activities", () => ({ recordAiActivity: (...args: unknown[]) => recordAiActivity(...args) }));
import { buildMcpServer } from "./server";

describe("buildMcpServer", () => {
  it("registra as tools sem throw", () => {
    const s = buildMcpServer();
    expect(s).toBeTruthy();
  });

  it("registra exatamente as 26 tools esperadas", () => {
    const s = buildMcpServer();
    const registered = (s as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(registered).sort()).toEqual(
      [
        "add_attachment", "add_comment", "archive_card", "assign_card", "create_card",
        "create_column", "delete_column", "delete_comment", "get_card", "get_card_by_code",
        "get_delivery_report", "list_archived_cards", "list_attachments", "list_cards",
        "list_columns", "list_labels", "list_users", "move_card", "move_column",
        "record_ai_activity", "set_card_bot", "unarchive_card", "unassign_card", "update_card", "update_column",
        "update_comment",
      ].sort(),
    );
  });

  type Tool = { handler: (a: Record<string, unknown>) => Promise<unknown> };
  const createCallback = () => {
    const s = buildMcpServer();
    const tools = (s as unknown as { _registeredTools: Record<string, Tool> })._registeredTools;
    return tools.create_card.handler;
  };

  const callback = (name: "update_card" | "move_card" | "add_comment" | "set_card_bot" | "record_ai_activity") => {
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

  it("set_card_bot liga e desliga a marca de robô", async () => {
    await callback("set_card_bot")({ id: "card1", bot: true });
    expect(setCardBot).toHaveBeenCalledWith("card1", true);

    await callback("set_card_bot")({ id: "card1", bot: false });
    expect(setCardBot).toHaveBeenCalledWith("card1", false);
  });

  it("record_ai_activity encaminha a atividade", async () => {
    await callback("record_ai_activity")({ cardId: "card1", type: "ANALYZED", idempotencyKey: "run1:analyzed" });
    expect(recordAiActivity).toHaveBeenCalledWith({ cardId: "card1", type: "ANALYZED", idempotencyKey: "run1:analyzed" });
  });

  /**
   * Payload enxuto no MCP (TI-595).
   *
   * Passos: setup = mocks das funções de resumo; asserts = list_columns usa
   * listColumnsSummary (NÃO a listColumns da UI, que embute todo card e gerava
   * 1,5 MB), list_cards e list_archived_cards usam as versões paginadas e
   * repassam limit/offset.
   */
  const listCallback = (name: "list_columns" | "list_cards" | "list_archived_cards") => {
    const s = buildMcpServer();
    const tools = (s as unknown as { _registeredTools: Record<string, Tool> })._registeredTools;
    return tools[name].handler;
  };

  it("list_columns usa a projeção com contagem, não a query da UI", async () => {
    listColumnsSummary.mockClear();
    await listCallback("list_columns")({});
    expect(listColumnsSummary).toHaveBeenCalled();
  });

  it("list_cards repassa limit e offset para a versão paginada", async () => {
    listCardsSummary.mockClear();
    await listCallback("list_cards")({ columnName: "A Fazer", limit: 10, offset: 20 });
    expect(listCardsSummary).toHaveBeenCalledWith(
      expect.objectContaining({ columnName: "A Fazer" }),
      { limit: 10, offset: 20 },
    );
  });

  it("list_cards sem paginação explícita não inventa limite", async () => {
    listCardsSummary.mockClear();
    await listCallback("list_cards")({});
    expect(listCardsSummary).toHaveBeenCalledWith({}, { limit: undefined, offset: undefined });
  });

  it("list_cards não repassa limit/offset como se fossem filtro", async () => {
    listCardsSummary.mockClear();
    await listCallback("list_cards")({ limit: 5, offset: 1 });
    const [filter] = listCardsSummary.mock.calls[0];
    expect(filter).not.toHaveProperty("limit");
    expect(filter).not.toHaveProperty("offset");
  });

  it("list_archived_cards usa a versão paginada", async () => {
    listArchivedCardsSummary.mockClear();
    await listCallback("list_archived_cards")({ limit: 5 });
    expect(listArchivedCardsSummary).toHaveBeenCalledWith({ limit: 5, offset: undefined });
  });

  it("nenhuma outra tool liga a marca de robô por conta própria", async () => {
    // Este arquivo não limpa os mocks entre casos; o anterior chama setCardBot.
    setCardBot.mockClear();
    createCard.mockClear();

    await callback("move_card")({ id: "card1", columnId: "c2", actor: "Giovanni" });
    await callback("add_comment")({ cardId: "card1", body: "x" });
    await createCallback()({ columnName: "A Fazer", title: "x" });

    expect(setCardBot).not.toHaveBeenCalled();
    expect(createCard).toHaveBeenCalledWith(expect.not.objectContaining({ bot: true }));
  });
});
