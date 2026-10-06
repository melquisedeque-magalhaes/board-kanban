import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  board: {
    findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
  column: { findMany: vi.fn() },
  card: { count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  BASIC_COLUMNS, createBoard, deleteBoard, resolveBoardId, updateBoard,
} from "./boards";

const MAIN = { id: "b1", name: "Board Time de IA", description: null };

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.board.findUnique.mockResolvedValue(null);
  // findFirst serve a dois usos: default (orderBy createdAt) e busca por nome.
  dbMock.board.findFirst.mockImplementation(async (args: { where?: unknown }) =>
    args?.where ? null : MAIN);
  dbMock.board.create.mockImplementation(async ({ data }: { data: { name: string } }) =>
    ({ id: "b2", name: data.name, description: null }));
  dbMock.card.count.mockResolvedValue(0);
});

describe("resolveBoardId", () => {
  it("sem ref cai no board principal", async () => {
    expect(await resolveBoardId()).toBe("b1");
    expect(await resolveBoardId("  ")).toBe("b1");
  });

  it("aceita id e nome", async () => {
    dbMock.board.findUnique.mockResolvedValueOnce({ id: "b2" });
    expect(await resolveBoardId("b2")).toBe("b2");

    dbMock.board.findFirst.mockResolvedValueOnce({ id: "b3" });
    expect(await resolveBoardId("Incidente X")).toBe("b3");
    expect(dbMock.board.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { name: "Incidente X" },
    }));
  });

  it("ref desconhecida é erro, não fallback silencioso pro principal", async () => {
    await expect(resolveBoardId("nao-existe")).rejects.toThrow(/Board não encontrado/);
  });
});

describe("createBoard", () => {
  it("sem origem nasce com as colunas básicas, em ordem", async () => {
    await createBoard({ name: "  Incidente X  " });
    expect(dbMock.board.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "Incidente X",
        columns: {
          create: BASIC_COLUMNS.map((name, i) => ({ name, color: null, position: (i + 1) * 1000 })),
        },
      }),
    }));
  });

  it("copia nome, cor e ordem das colunas de outro board", async () => {
    dbMock.board.findUnique.mockResolvedValueOnce({ id: "b1" });
    dbMock.column.findMany.mockResolvedValue([
      { name: "Backlog", color: "#d3e5ef" }, { name: "Feito", color: null },
    ]);

    await createBoard({ name: "Sprint", copyColumnsFrom: "b1" });

    expect(dbMock.column.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { boardId: "b1" }, orderBy: { position: "asc" },
    }));
    expect(dbMock.board.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        columns: { create: [
          { name: "Backlog", color: "#d3e5ef", position: 1000 },
          { name: "Feito", color: null, position: 2000 },
        ] },
      }),
    }));
  });

  it("usa a lista informada, sem vazios nem repetidos", async () => {
    await createBoard({ name: "X", columns: ["Triagem", " ", "Triagem", "Resolvido"] });
    const data = dbMock.board.create.mock.calls[0][0].data;
    expect(data.columns.create.map((c: { name: string }) => c.name)).toEqual(["Triagem", "Resolvido"]);
  });

  it("recusa nome vazio, nome repetido e board sem coluna", async () => {
    await expect(createBoard({ name: "  " })).rejects.toThrow(/obrigatório/);

    dbMock.board.findFirst.mockResolvedValueOnce({ id: "b1" });
    await expect(createBoard({ name: "Board Time de IA" })).rejects.toThrow(/Já existe um board/);

    await expect(createBoard({ name: "Y", columns: [" "] })).rejects.toThrow(/pelo menos uma coluna/);
    expect(dbMock.board.create).not.toHaveBeenCalled();
  });
});

describe("updateBoard", () => {
  it("descrição em branco vira null", async () => {
    await updateBoard("b2", { description: "   " });
    expect(dbMock.board.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "b2" }, data: { name: undefined, description: null },
    }));
  });
});

describe("deleteBoard", () => {
  it("não exclui o board principal", async () => {
    dbMock.board.findUnique.mockResolvedValueOnce({ id: "b1", name: MAIN.name });
    await expect(deleteBoard("b1")).rejects.toThrow(/principal/);
    expect(dbMock.board.delete).not.toHaveBeenCalled();
  });

  it("não exclui board com card — o cascade apagaria os cards", async () => {
    dbMock.board.findUnique.mockResolvedValueOnce({ id: "b2", name: "Sprint" });
    dbMock.card.count.mockResolvedValue(3);
    await expect(deleteBoard("b2")).rejects.toThrow(/ainda tem 3 card/);
    expect(dbMock.card.count).toHaveBeenCalledWith({ where: { column: { boardId: "b2" } } });
    expect(dbMock.board.delete).not.toHaveBeenCalled();
  });

  it("exclui board vazio", async () => {
    dbMock.board.findUnique.mockResolvedValueOnce({ id: "b2", name: "Sprint" });
    await deleteBoard("b2");
    expect(dbMock.board.delete).toHaveBeenCalledWith({ where: { id: "b2" } });
  });
});
