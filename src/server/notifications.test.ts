import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  notification: {
    findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(),
    updateMany: vi.fn(), createMany: vi.fn(),
  },
  columnSubscription: {
    findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(),
  },
  column: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  buildNotificationRows, cardRef, listNotifications, markAllNotificationsRead, notificationMessage,
  notificationVersion, notifyBlockerChange, notifyCardMoved, notifyComment, setNotificationRead,
  listColumnSubscribers, subscribeToColumn, unsubscribeFromColumn,
} from "./notifications";

beforeEach(() => vi.clearAllMocks());

describe("buildNotificationRows", () => {
  it("deduplica papéis e remove o autor", () => {
    expect(buildNotificationRows({
      actorId: "u1", cardId: "c1", type: "COMMENT_ADDED",
      message: "Comentário em TI-258", recipientIds: ["u1", "u2", "u2"],
    })).toEqual([{ recipientId: "u2", actorId: "u1", cardId: "c1",
      type: "COMMENT_ADDED", message: "Comentário em TI-258" }]);
  });

  it("não suprime ninguém sem autor identificável", () => {
    expect(buildNotificationRows({
      actorId: null, cardId: "c1", type: "BLOCKER_ADDED",
      message: "Impedimento em TI-258", recipientIds: ["u1", "u2"],
    }).map((x) => x.recipientId)).toEqual(["u1", "u2"]);
  });
});

describe("mensagens de notificação", () => {
  it("mantém a referência do card e as mensagens em pt-BR determinísticas", () => {
    expect(cardRef({ code: "TI-258", title: "Notificações" })).toBe("TI-258 · Notificações");
    expect(cardRef({ code: null, title: "Sem chave" })).toBe("Sem chave");
    expect(notificationMessage.blockerChanged("TI-258 · Notificações", "API", "acesso")).toBe(
      "Bloqueio de TI-258 · Notificações alterado de API para acesso",
    );
  });
});

describe("emissores transacionais", () => {
  const card = {
    id: "c1", code: "TI-258", title: "Notificações", requestedById: "u2",
    assignees: [{ id: "u1" }, { id: "u3" }],
  };

  function transactionMock() {
    return {
      card: { findUniqueOrThrow: vi.fn().mockResolvedValue(card) },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it("notifica responsáveis e solicitante de comentário, sem notificar o autor", async () => {
    const tx = transactionMock();
    await notifyComment(tx as never, "c1", "u1");

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        { recipientId: "u3", actorId: "u1", cardId: "c1", type: "COMMENT_ADDED", message: "Novo comentário em TI-258 · Notificações" },
        { recipientId: "u2", actorId: "u1", cardId: "c1", type: "COMMENT_ADDED", message: "Novo comentário em TI-258 · Notificações" },
      ],
    });
  });

  it.each([
    [null, "API", "BLOCKER_ADDED", "API adicionado em TI-258 · Notificações"],
    ["API", null, "BLOCKER_REMOVED", "API removido de TI-258 · Notificações"],
    ["API", "Acesso", "BLOCKER_CHANGED", "Bloqueio de TI-258 · Notificações alterado de API para Acesso"],
  ] as const)("emite %s para %s", async (before, after, type, message) => {
    const tx = transactionMock();
    await notifyBlockerChange(tx as never, "c1", "u1", before, after);

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        { recipientId: "u3", actorId: "u1", cardId: "c1", type, message },
        { recipientId: "u2", actorId: "u1", cardId: "c1", type, message },
      ],
    });
  });

  it("não emite quando a razão do bloqueio não mudou", async () => {
    const tx = transactionMock();
    await notifyBlockerChange(tx as never, "c1", "u1", "API", "API");

    expect(tx.card.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("notifyCardMoved", () => {
  const card = {
    id: "c1", code: "TI-258", title: "Notificações", requestedById: "u2",
    assignees: [{ id: "u1" }],
  };

  function transactionMock(subscribers: { userId: string }[] = []) {
    return {
      card: { findUniqueOrThrow: vi.fn().mockResolvedValue(card) },
      columnSubscription: { findMany: vi.fn().mockResolvedValue(subscribers) },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it("não cria notificações em reorder na mesma coluna", async () => {
    const tx = transactionMock();
    await notifyCardMoved(tx as never, "c1", "u1", "col1", { id: "col1", name: "Em Andamento" });

    expect(tx.card.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it("notifica inscritos quando entra em uma coluna comum", async () => {
    const tx = transactionMock([{ userId: "u1" }, { userId: "u3" }]);
    await notifyCardMoved(tx as never, "c1", "u1", "col0", { id: "col1", name: "Em Andamento" });

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [{
        recipientId: "u3", actorId: "u1", cardId: "c1", type: "CARD_ENTERED_COLUMN",
        message: "TI-258 · Notificações entrou em Em Andamento",
      }],
    });
  });

  it("prioriza responsáveis e solicitante ao entrar em Aguardando Teste", async () => {
    const tx = transactionMock([{ userId: "u2" }, { userId: "u3" }]);
    await notifyCardMoved(tx as never, "c1", "u1", "col0", { id: "col1", name: "Aguardando Teste" });

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          recipientId: "u2", actorId: "u1", cardId: "c1", type: "CARD_READY_FOR_TEST",
          message: "TI-258 · Notificações foi liberado para teste",
        },
        {
          recipientId: "u3", actorId: "u1", cardId: "c1", type: "CARD_ENTERED_COLUMN",
          message: "TI-258 · Notificações entrou em Aguardando Teste",
        },
      ],
    });
  });
});

describe("histórico e leitura", () => {
  it("pagina notificações por id, inclui o ator e devolve a próxima chave", async () => {
    const notifications = [
      { id: "n3", sequence: BigInt(3) },
      { id: "n2", sequence: BigInt(2) },
      { id: "n1", sequence: BigInt(1) },
    ];
    dbMock.notification.findMany.mockResolvedValue(notifications);
    dbMock.notification.count.mockResolvedValue(4);

    await expect(listNotifications("u1", { cursor: "n4", limit: 2 })).resolves.toEqual({
      items: [
        { id: "n3", sequence: "3" },
        { id: "n2", sequence: "2" },
      ],
      nextCursor: "n2",
      unreadCount: 4,
    });
    expect(dbMock.notification.findMany).toHaveBeenCalledWith({
      where: { recipientId: "u1" },
      take: 3,
      orderBy: { sequence: "desc" },
      cursor: { id: "n4" },
      skip: 1,
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });
    expect(dbMock.notification.count).toHaveBeenCalledWith({ where: { recipientId: "u1", readAt: null } });
  });

  it("devolve primeira página sem cursor e sem próxima chave quando não há overflow", async () => {
    const notifications = [
      { id: "n2", sequence: BigInt(2) },
      { id: "n1", sequence: BigInt(1) },
    ];
    dbMock.notification.findMany.mockResolvedValue(notifications);
    dbMock.notification.count.mockResolvedValue(0);

    await expect(listNotifications("u1", { limit: 2 })).resolves.toEqual({
      items: [{ id: "n2", sequence: "2" }, { id: "n1", sequence: "1" }],
      nextCursor: null,
      unreadCount: 0,
    });
    expect(dbMock.notification.findMany).toHaveBeenCalledWith({
      where: { recipientId: "u1" },
      take: 3,
      orderBy: { sequence: "desc" },
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });
  });

  it("calcula a versão por última notificação e contagens", async () => {
    dbMock.notification.findFirst.mockResolvedValue({
      id: "n9",
      sequence: BigInt(9),
      createdAt: new Date("2026-08-17T12:00:09.000Z"),
    });
    dbMock.notification.count.mockResolvedValueOnce(7).mockResolvedValueOnce(2);

    await expect(notificationVersion("u1")).resolves.toEqual({
      version: "9-7-2",
      unreadCount: 2,
      totalCount: 7,
      latestId: "n9",
      latestCreatedAt: "2026-08-17T12:00:09.000Z",
      latestSequence: "9",
    });
  });

  it("altera a leitura somente da notificação do destinatário", async () => {
    dbMock.notification.updateMany.mockResolvedValue({ count: 1 });
    await setNotificationRead("u1", "n1", true);

    expect(dbMock.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", recipientId: "u1" },
      data: { readAt: expect.any(Date) },
    });
  });

  it("remove a marca de leitura somente da notificação do destinatário", async () => {
    dbMock.notification.updateMany.mockResolvedValue({ count: 1 });
    await setNotificationRead("u1", "n1", false);

    expect(dbMock.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", recipientId: "u1" },
      data: { readAt: null },
    });
  });

  it("rejeita leitura de notificação pertencente a outro destinatário", async () => {
    dbMock.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(setNotificationRead("u1", "n2", false)).rejects.toThrow("Notificação não encontrada");
  });

  it("marca todas as notificações não lidas como lidas", async () => {
    dbMock.notification.updateMany.mockResolvedValue({ count: 3 });
    await markAllNotificationsRead("u1");

    expect(dbMock.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: "u1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("inscrições de coluna", () => {
  it("lista inscritos com os usuários ordenados por nome", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "col1" });
    dbMock.columnSubscription.findMany.mockResolvedValue([{ userId: "u1" }]);
    await expect(listColumnSubscribers("col1")).resolves.toEqual([{ userId: "u1" }]);
    expect(dbMock.columnSubscription.findMany).toHaveBeenCalledWith({
      where: { columnId: "col1" }, include: { user: true }, orderBy: { user: { name: "asc" } },
    });
  });

  it("rejeita a listagem de uma coluna inexistente", async () => {
    dbMock.column.findUnique.mockResolvedValue(null);

    await expect(listColumnSubscribers("missing")).rejects.toThrow("Coluna não encontrada");
    expect(dbMock.columnSubscription.findMany).not.toHaveBeenCalled();
  });

  it("faz subscribe idempotente pela chave composta", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "col1" });
    dbMock.user.findUnique.mockResolvedValue({ id: "u1" });
    dbMock.columnSubscription.upsert.mockResolvedValue({ columnId: "col1", userId: "u1" });

    await subscribeToColumn("col1", "u1");
    expect(dbMock.columnSubscription.upsert).toHaveBeenCalledWith({
      where: { columnId_userId: { columnId: "col1", userId: "u1" } },
      create: { columnId: "col1", userId: "u1" }, update: {},
    });
  });

  it("faz unsubscribe idempotente", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "col1" });
    dbMock.user.findUnique.mockResolvedValue({ id: "u1" });
    dbMock.columnSubscription.deleteMany.mockResolvedValue({ count: 0 });

    await expect(unsubscribeFromColumn("col1", "u1")).resolves.toEqual({ ok: true });
    expect(dbMock.columnSubscription.deleteMany).toHaveBeenCalledWith({ where: { columnId: "col1", userId: "u1" } });
  });

  it.each([
    [null, { id: "u1" }, "Coluna não encontrada"],
    [{ id: "col1" }, null, "Usuário não encontrado"],
  ])("rejeita referências inexistentes", async (column, user, message) => {
    dbMock.column.findUnique.mockResolvedValue(column);
    dbMock.user.findUnique.mockResolvedValue(user);

    await expect(subscribeToColumn("col1", "u1")).rejects.toThrow(message);
  });
});
