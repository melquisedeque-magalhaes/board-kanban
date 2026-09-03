import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock)),
  column: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  card: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(),
    update: vi.fn(), delete: vi.fn(), aggregate: vi.fn(), count: vi.fn(),
  },
  user: { findMany: vi.fn() },
  label: { findMany: vi.fn() },
  comment: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), count: vi.fn() },
  attachment: { updateMany: vi.fn(), count: vi.fn() },
  counter: { update: vi.fn(), findUnique: vi.fn() },
  notification: { createMany: vi.fn() },
  columnSubscription: { findMany: vi.fn() },
  workflowTrigger: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

const notificationMock = vi.hoisted(() => ({
  moved: vi.fn(), blocker: vi.fn(), comment: vi.fn(),
}));
vi.mock("./notifications", () => ({
  notifyCardMoved: notificationMock.moved,
  notifyBlockerChange: notificationMock.blocker,
  notifyComment: notificationMock.comment,
}));
const triggerMock = vi.hoisted(() => ({ dispatchCardCreated: vi.fn(), dispatchCardMoved: vi.fn() }));
vi.mock("./card-created-trigger", () => triggerMock);
vi.mock("./card-moved-trigger", () => triggerMock);

import {
  resolveColumnId, moveCard, deleteCard, assignCard, unassignCard, addComment,
  createCard, updateCard, getCard, listColumns, nextCardCode, peekCardCode,
  normalizeCardCode, getCardByCode, deleteComment, boardVersion, setCardBot,
} from "./cards";

beforeEach(() => vi.clearAllMocks());

describe("listColumns", () => {
  it("inclui a contagem de inscrições de cada coluna", async () => {
    dbMock.column.findMany.mockResolvedValue([]);

    await listColumns();

    expect(dbMock.column.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        _count: { select: { subscriptions: true } },
      }),
    }));
  });
});

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
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: null, column: { id: "c1", name: "Desenvolvimento" } });
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 2000 });
    const r = await moveCard("card1", "c1", undefined);
    expect(dbMock.card.update).toHaveBeenCalled();
    expect(r.position).toBe(2000);
  });

  it("rejeita mudança de coluna com IMPEDIMENTO", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "IMPEDIMENTO" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2" });
    await expect(moveCard("card1", "c2")).rejects.toThrow(/não pode mudar de coluna/);
    expect(dbMock.card.update).not.toHaveBeenCalled();
  });

  it("rejeita mudança de coluna com AJUSTES", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "AJUSTES" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2" });
    await expect(moveCard("card1", "c2")).rejects.toThrow(/não pode mudar de coluna/);
    expect(dbMock.card.update).not.toHaveBeenCalled();
  });

  it("permite mudança de coluna com AVISO", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "AVISO" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c2", position: 2000 });
    await expect(moveCard("card1", "c2")).resolves.toBeTruthy();
    expect(dbMock.card.update).toHaveBeenCalled();
  });

  it("permite reorder na mesma coluna mesmo com IMPEDIMENTO", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "IMPEDIMENTO" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 2000 });
    await expect(moveCard("card1", "c1")).resolves.toBeTruthy();
    expect(dbMock.card.update).toHaveBeenCalled();
  });

  it("não autoatribui o ator ao reordenar na mesma coluna Em Andamento", async () => {
    dbMock.user.findMany.mockResolvedValue([{ id: "u1" }]);
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: null });
    dbMock.column.findUnique.mockResolvedValue({ id: "c1", name: "Em Andamento" });
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 1000 });

    await moveCard("card1", "c1", 1000, "Giovanni");

    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { columnId: "c1", position: 1000, assignees: undefined },
    }));
  });

  it("emite a mudança de coluna dentro da transação com o ator resolvido", async () => {
    dbMock.user.findMany.mockResolvedValue([{ id: "u1" }]);
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: null });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2", name: "Aguardando Teste" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c2", position: 2000 });

    await moveCard("card1", "c2", undefined, "Giovanni");

    expect(dbMock.$transaction).toHaveBeenCalledOnce();
    expect(notificationMock.moved).toHaveBeenCalledWith(
      dbMock, "card1", "u1", "c1", { id: "c2", name: "Aguardando Teste" },
    );
  });

  it("dispara trigger depois do commit somente ao mudar de coluna", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: null, column: { id: "c1", name: "Desenvolvimento" } });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2", name: "Aguardando Teste" });
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c2", position: 1000 });

    await moveCard("card1", "c2");

    expect(triggerMock.dispatchCardMoved).toHaveBeenCalledWith(
      "card1",
      { id: "c1", name: "Desenvolvimento" },
      { id: "c2", name: "Aguardando Teste" },
    );
  });

  it("não dispara trigger ao reordenar na mesma coluna", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: null });
    dbMock.column.findUnique.mockResolvedValue({ id: "c1", name: "Desenvolvimento" });
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 1000 });

    await moveCard("card1", "c1", 1000);

    expect(triggerMock.dispatchCardMoved).not.toHaveBeenCalled();
  });
});

describe("deleteCard", () => {
  it("coleta urls de blob (card + comentários) e apaga", async () => {
    dbMock.card.findUnique.mockResolvedValue({
      attachments: [{ url: "u1" }],
      comments: [{ attachments: [{ url: "u2" }, { url: "u3" }] }],
    });
    dbMock.card.delete.mockResolvedValue({});
    const r = await deleteCard("card1");
    expect(r).toEqual({ urls: ["u1", "u2", "u3"] });
    expect(dbMock.card.delete).toHaveBeenCalledWith({ where: { id: "card1" } });
  });
  it("devolve null se card não existe (não apaga)", async () => {
    dbMock.card.findUnique.mockResolvedValue(null);
    expect(await deleteCard("nope")).toBeNull();
    expect(dbMock.card.delete).not.toHaveBeenCalled();
  });
});

describe("assign/unassign", () => {
  it("assignCard usa connect (não remove os demais)", async () => {
    dbMock.user.findMany.mockResolvedValue([{ id: "u1" }]);
    dbMock.card.update.mockResolvedValue({ id: "c1" });
    await assignCard("c1", ["Maria"]);
    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { assignees: { connect: [{ id: "u1" }] } },
    }));
  });
  it("unassignCard usa disconnect", async () => {
    dbMock.user.findMany.mockResolvedValue([{ id: "u1" }]);
    dbMock.card.update.mockResolvedValue({ id: "c1" });
    await unassignCard("c1", ["u1"]);
    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { assignees: { disconnect: [{ id: "u1" }] } },
    }));
  });
});

describe("addComment", () => {
  it("vincula anexos pendentes ao novo comentário", async () => {
    dbMock.comment.create.mockResolvedValue({ id: "cm1" });
    dbMock.attachment.updateMany.mockResolvedValue({ count: 2 });
    await addComment("card1", "olha o print", "author1", ["a1", "a2"]);
    expect(dbMock.attachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1", "a2"] }, cardId: "card1", commentId: null },
      data: { commentId: "cm1" },
    });
  });
  it("não chama updateMany sem anexos", async () => {
    dbMock.comment.create.mockResolvedValue({ id: "cm2" });
    await addComment("card1", "texto");
    expect(dbMock.attachment.updateMany).not.toHaveBeenCalled();
  });

  it("emite o comentário na mesma transação", async () => {
    dbMock.comment.create.mockResolvedValue({ id: "cm3" });

    expect(await addComment("card1", "texto", "u1")).toEqual({ id: "cm3" });

    expect(dbMock.$transaction).toHaveBeenCalledOnce();
    expect(notificationMock.comment).toHaveBeenCalledWith(dbMock, "card1", "u1");
  });
});

describe("createCard subtask/blocker", () => {
  it("grava parentId e blocker ao criar", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "col1" });
    dbMock.card.findMany.mockResolvedValue([]);      // sem cards → position base
    dbMock.card.findMany.mockResolvedValueOnce([]);  // last position
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.label.findMany.mockResolvedValue([]);
    dbMock.card.create.mockResolvedValue({ id: "new1" });
    dbMock.counter.update.mockResolvedValue({ value: 1 });
    await createCard({
      columnName: "A Fazer", title: "Corrigir X", type: "BUG",
      parentId: "parent1", blocker: "IMPEDIMENTO", blockerReason: "esperando API",
    });
    expect(dbMock.card.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        parentId: "parent1", blocker: "IMPEDIMENTO", blockerReason: "esperando API",
      }),
    }));
    expect(triggerMock.dispatchCardCreated).toHaveBeenCalledWith({ id: "new1" });
  });
});

describe("updateCard blocker", () => {
  it("limpa blocker com null e seta motivo", async () => {
    dbMock.card.update.mockResolvedValue({ id: "c1" });
    await updateCard("c1", { blocker: null, blockerReason: null });
    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ blocker: null, blockerReason: null }),
    }));
  });
  it("vincula parentId no update", async () => {
    dbMock.card.update.mockResolvedValue({ id: "c1" });
    await updateCard("c1", { parentId: "p9" });
    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parentId: "p9" }),
    }));
  });
  it("rejeita um card sendo pai de si mesmo", async () => {
    await expect(updateCard("c1", { parentId: "c1" })).rejects.toThrow();
    expect(dbMock.card.update).not.toHaveBeenCalled();
  });

  it("emite alteração de blocker dentro da transação com o ator resolvido", async () => {
    dbMock.user.findMany.mockResolvedValue([{ id: "u1" }]);
    dbMock.card.findUnique.mockResolvedValue({ blocker: null });
    dbMock.card.update.mockResolvedValue({ id: "card1", blocker: "IMPEDIMENTO" });

    await updateCard("card1", { blocker: "IMPEDIMENTO" }, "Giovanni");

    expect(dbMock.$transaction).toHaveBeenCalledOnce();
    expect(notificationMock.blocker).toHaveBeenCalledWith(
      dbMock, "card1", "u1", null, "IMPEDIMENTO",
    );
  });

  it("não emite alteração de blocker ao editar somente o motivo", async () => {
    dbMock.card.findUnique.mockResolvedValue({ blocker: "IMPEDIMENTO" });
    dbMock.card.update.mockResolvedValue({ id: "card1", blocker: "IMPEDIMENTO" });

    await updateCard("card1", { blockerReason: "aguardando API" }, "u1");

    expect(notificationMock.blocker).not.toHaveBeenCalled();
  });
});

describe("getCard", () => {
  it("filtra subtarefas arquivadas no include de children", async () => {
    dbMock.card.findUnique.mockResolvedValue({});
    await getCard("x");
    expect(dbMock.card.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        children: expect.objectContaining({ where: { archivedAt: null } }),
      }),
    }));
  });
});

describe("nextCardCode", () => {
  it("incrementa o contador atômico e formata TI-N", async () => {
    dbMock.counter.update.mockResolvedValue({ value: 130 });
    expect(await nextCardCode()).toBe("TI-130");
    expect(dbMock.counter.update).toHaveBeenCalledWith({
      where: { name: "card" },
      data: { value: { increment: 1 } },
      select: { value: true },
    });
  });
  it("chamadas sequenciais devolvem valores distintos do contador", async () => {
    dbMock.counter.update.mockResolvedValueOnce({ value: 1 }).mockResolvedValueOnce({ value: 2 });
    expect(await nextCardCode()).toBe("TI-1");
    expect(await nextCardCode()).toBe("TI-2");
  });
});

describe("createCard documentation", () => {
  it("persiste o campo documentation", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "col1" });
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.label.findMany.mockResolvedValue([]);
    dbMock.counter.update.mockResolvedValue({ value: 5 });
    dbMock.card.create.mockResolvedValue({ id: "new" });
    await createCard({ columnName: "A Fazer", title: "x", documentation: "- [doc](http://a)" });
    expect(dbMock.card.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentation: "- [doc](http://a)" }),
      }),
    );
  });
});

describe("peekCardCode", () => {
  it("devolve a próxima chave sem consumir (value+1)", async () => {
    dbMock.counter.findUnique.mockResolvedValue({ value: 12 });
    expect(await peekCardCode()).toBe("TI-13");
    expect(dbMock.counter.update).not.toHaveBeenCalled();
  });

  it("começa em TI-1 se o contador ainda não existir", async () => {
    dbMock.counter.findUnique.mockResolvedValue(null);
    expect(await peekCardCode()).toBe("TI-1");
  });
});

describe("normalizeCardCode", () => {
  it("aceita a chave como o time escreve", () => {
    expect(normalizeCardCode("TI-282")).toBe("TI-282");
    expect(normalizeCardCode(" ti-282 ")).toBe("TI-282");
    expect(normalizeCardCode("ti 282")).toBe("TI-282");
    expect(normalizeCardCode("TI282")).toBe("TI-282");
    expect(normalizeCardCode("282")).toBe("TI-282");
  });

  it("preserva outro prefixo em vez de forçar TI-", () => {
    expect(normalizeCardCode("abc-9")).toBe("ABC-9");
  });
});

describe("getCardByCode", () => {
  it("busca pela chave normalizada e traz os comentários", async () => {
    dbMock.card.findFirst.mockResolvedValue({ id: "card1", code: "TI-282" });

    const r = await getCardByCode("ti282");

    expect(dbMock.card.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { code: "TI-282" },
      include: expect.objectContaining({ comments: expect.anything() }),
    }));
    expect(r).toEqual({ id: "card1", code: "TI-282" });
  });

  it("chave inexistente devolve null (sem throw)", async () => {
    dbMock.card.findFirst.mockResolvedValue(null);
    expect(await getCardByCode("TI-99999")).toBeNull();
  });
});

describe("deleteComment", () => {
  it("apaga o comentário e devolve as URLs dos anexos p/ limpar o Blob", async () => {
    dbMock.comment.findUnique.mockResolvedValue({
      id: "cm1", attachments: [{ url: "https://x.blob.vercel-storage.com/a.png" }],
    });

    const r = await deleteComment("cm1");

    expect(dbMock.comment.delete).toHaveBeenCalledWith({ where: { id: "cm1" } });
    expect(r).toEqual({ urls: ["https://x.blob.vercel-storage.com/a.png"] });
  });

  it("comentário inexistente devolve null e não apaga nada", async () => {
    dbMock.comment.findUnique.mockResolvedValue(null);
    expect(await deleteComment("nope")).toBeNull();
    expect(dbMock.comment.delete).not.toHaveBeenCalled();
  });
});

describe("boardVersion", () => {
  const counts = () => {
    dbMock.card.aggregate.mockResolvedValue({ _max: { updatedAt: new Date(5) } });
    dbMock.card.count.mockResolvedValue(2);
    dbMock.comment.count.mockResolvedValue(1);
    dbMock.attachment.count.mockResolvedValue(0);
  };

  it("muda quando uma coluna é renomeada, recolorida ou movida", async () => {
    counts();
    dbMock.column.findMany.mockResolvedValue([{ id: "c1", name: "A Fazer", color: null, position: 1000 }]);
    const before = await boardVersion();

    counts();
    dbMock.column.findMany.mockResolvedValue([{ id: "c1", name: "Backlog", color: null, position: 1000 }]);
    const renamed = await boardVersion();

    counts();
    dbMock.column.findMany.mockResolvedValue([{ id: "c1", name: "A Fazer", color: "#d3e5ef", position: 1000 }]);
    const recolored = await boardVersion();

    counts();
    dbMock.column.findMany.mockResolvedValue([{ id: "c1", name: "A Fazer", color: null, position: 2000 }]);
    const moved = await boardVersion();

    expect(new Set([before, renamed, recolored, moved]).size).toBe(4);
  });

  it("é estável quando nada muda", async () => {
    counts();
    dbMock.column.findMany.mockResolvedValue([{ id: "c1", name: "A Fazer", color: null, position: 1000 }]);
    const a = await boardVersion();
    counts();
    dbMock.column.findMany.mockResolvedValue([{ id: "c1", name: "A Fazer", color: null, position: 1000 }]);
    expect(await boardVersion()).toBe(a);
  });
});

describe("marca de robô", () => {
  const stubCreate = () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "col1" });
    dbMock.card.findMany.mockResolvedValue([]);
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.label.findMany.mockResolvedValue([]);
    dbMock.counter.update.mockResolvedValue({ value: 1 });
    dbMock.card.create.mockResolvedValue({ id: "new" });
  };

  it("card nasce desmarcado", async () => {
    stubCreate();
    await createCard({ columnName: "A Fazer", title: "x" });
    expect(dbMock.card.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bot: false }),
    }));
  });

  it("createCard aceita já nascer marcado", async () => {
    stubCreate();
    await createCard({ columnName: "A Fazer", title: "x", bot: true });
    expect(dbMock.card.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bot: true }),
    }));
  });

  it("updateCard encaminha a flag", async () => {
    dbMock.card.findUnique.mockResolvedValue({ blocker: null });
    dbMock.card.update.mockResolvedValue({ id: "card1", bot: true });
    dbMock.user.findMany.mockResolvedValue([]);

    await updateCard("card1", { bot: true });

    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bot: true }),
    }));
  });

  it("setCardBot só toca a flag — não arrasta assignee, label nem notificação", async () => {
    dbMock.card.update.mockResolvedValue({ id: "card1", bot: true });

    await setCardBot("card1", true);

    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "card1" }, data: { bot: true },
    }));
    expect(dbMock.user.findMany).not.toHaveBeenCalled();
    expect(dbMock.label.findMany).not.toHaveBeenCalled();
    expect(notificationMock.moved).not.toHaveBeenCalled();
    expect(notificationMock.blocker).not.toHaveBeenCalled();
  });

  it("setCardBot desmarca", async () => {
    dbMock.card.update.mockResolvedValue({ id: "card1", bot: false });
    await setCardBot("card1", false);
    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { bot: false },
    }));
  });
});
