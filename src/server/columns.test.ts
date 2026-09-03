import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  board: { findFirst: vi.fn() },
  column: {
    findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
  card: { count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { createColumn, updateColumn, moveColumn, deleteColumn } from "./columns";

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.board.findFirst.mockResolvedValue({ id: "b1" });
  dbMock.column.findFirst.mockResolvedValue(null);
  dbMock.column.findMany.mockResolvedValue([]);
  dbMock.card.count.mockResolvedValue(0);
});

describe("createColumn", () => {
  it("entra no fim do board, um STEP depois da última", async () => {
    dbMock.column.findMany.mockResolvedValue([{ position: 8000 }]);

    await createColumn({ name: "Code Review", color: "#D3E5EF" });

    expect(dbMock.column.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        boardId: "b1", name: "Code Review", color: "#d3e5ef", position: 9000,
      }),
    }));
  });

  it("recusa nome duplicado — resolveColumnId busca coluna por nome", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "c1", name: "A Fazer" });
    await expect(createColumn({ name: "A Fazer" })).rejects.toThrow(/Já existe uma coluna/);
    expect(dbMock.column.create).not.toHaveBeenCalled();
  });

  it("recusa nome vazio", async () => {
    await expect(createColumn({ name: "   " })).rejects.toThrow(/obrigatório/);
  });

  it("recusa cor que não é hex", async () => {
    await expect(createColumn({ name: "X", color: "azul" })).rejects.toThrow(/Cor inválida/);
  });

  it("cor vazia salva como null (usa a cor default)", async () => {
    await createColumn({ name: "X", color: "" });
    expect(dbMock.column.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ color: null }),
    }));
  });
});

describe("updateColumn", () => {
  it("renomeia sem colidir com a própria coluna", async () => {
    await updateColumn("c1", { name: "Teste" });
    expect(dbMock.column.findFirst).toHaveBeenCalledWith({
      where: { name: "Teste", id: { not: "c1" } },
    });
    expect(dbMock.column.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "c1" }, data: expect.objectContaining({ name: "Teste" }),
    }));
  });

  it("recusa renomear para o nome de outra coluna", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "c2" });
    await expect(updateColumn("c1", { name: "Done" })).rejects.toThrow(/Já existe uma coluna/);
    expect(dbMock.column.update).not.toHaveBeenCalled();
  });

  it("color null limpa a cor; campo ausente não é tocado", async () => {
    await updateColumn("c1", { color: null });
    expect(dbMock.column.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: undefined, color: null },
    }));
  });
});

describe("moveColumn", () => {
  const cols = [
    { id: "a", position: 1000 },
    { id: "b", position: 2000 },
    { id: "c", position: 3000 },
  ];

  it("index 0 joga a coluna para antes da primeira", async () => {
    dbMock.column.findMany.mockResolvedValue(cols);
    await moveColumn("c", { index: 0 });
    expect(dbMock.column.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { position: 0 }, // 1000 - STEP
    }));
  });

  it("index no meio cai entre os vizinhos", async () => {
    dbMock.column.findMany.mockResolvedValue(cols);
    await moveColumn("a", { index: 1 });
    expect(dbMock.column.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { position: 2500 }, // entre b (2000) e c (3000)
    }));
  });

  it("index além do fim vai para o fim", async () => {
    dbMock.column.findMany.mockResolvedValue(cols);
    await moveColumn("a", { index: 99 });
    expect(dbMock.column.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { position: 4000 },
    }));
  });

  it("position explícita é usada sem recalcular nada", async () => {
    await moveColumn("a", { position: 1234 });
    expect(dbMock.column.findMany).not.toHaveBeenCalled();
    expect(dbMock.column.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { position: 1234 },
    }));
  });

  it("exige position ou index", async () => {
    await expect(moveColumn("a", {})).rejects.toThrow(/position ou index/);
  });
});

describe("deleteColumn", () => {
  it("exclui coluna vazia", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "c1", name: "Vazia" });

    const r = await deleteColumn("c1");

    expect(dbMock.column.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(r).toEqual({ id: "c1", name: "Vazia" });
  });

  it("bloqueia coluna com card ativo — cascade apagaria os cards", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "c1", name: "A Fazer" });
    dbMock.card.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    await expect(deleteColumn("c1")).rejects.toThrow(/ainda tem 3 card\(s\)/);
    expect(dbMock.column.delete).not.toHaveBeenCalled();
  });

  it("bloqueia também por card arquivado", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "c1", name: "Done" });
    dbMock.card.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);

    await expect(deleteColumn("c1")).rejects.toThrow(/2 arquivado\(s\)/);
    expect(dbMock.column.delete).not.toHaveBeenCalled();
  });

  it("coluna inexistente dá erro de não encontrada", async () => {
    dbMock.column.findUnique.mockResolvedValue(null);
    await expect(deleteColumn("nope")).rejects.toThrow(/não encontrada/);
  });
});
