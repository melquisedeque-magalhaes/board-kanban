import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  column: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  card: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  user: { findMany: vi.fn() },
  label: { findMany: vi.fn() },
  comment: { create: vi.fn() },
  attachment: { updateMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  resolveColumnId, moveCard, deleteCard, assignCard, unassignCard, addComment,
  createCard, updateCard, getCard,
} from "./cards";

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
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: null });
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
});

describe("createCard subtask/blocker", () => {
  it("grava parentId e blocker ao criar", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "col1" });
    dbMock.card.findMany.mockResolvedValue([]);      // sem cards → position base
    dbMock.card.findMany.mockResolvedValueOnce([]);  // last position
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.label.findMany.mockResolvedValue([]);
    dbMock.card.create.mockResolvedValue({ id: "new1" });
    await createCard({
      columnName: "A Fazer", title: "Corrigir X", type: "BUG",
      parentId: "parent1", blocker: "IMPEDIMENTO", blockerReason: "esperando API",
    });
    expect(dbMock.card.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        parentId: "parent1", blocker: "IMPEDIMENTO", blockerReason: "esperando API",
      }),
    }));
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
