import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const columnMocks = vi.hoisted(() => ({
  createColumn: vi.fn(),
  updateColumn: vi.fn(),
  moveColumn: vi.fn(),
  deleteColumn: vi.fn(),
}));
vi.mock("@/server/columns", () => columnMocks);

import { DELETE, PATCH } from "./route";

const patch = (body: unknown) =>
  PATCH(new Request("http://x/api/columns/c1", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "c1" }),
  });

const del = () =>
  DELETE(new Request("http://x/api/columns/c1", { method: "DELETE" }), {
    params: Promise.resolve({ id: "c1" }),
  });

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/columns/[id]", () => {
  it("renomeia", async () => {
    columnMocks.updateColumn.mockResolvedValue({ id: "c1", name: "Backlog" });

    const response = await patch({ name: "Backlog" });

    expect(response.status).toBe(200);
    expect(columnMocks.updateColumn).toHaveBeenCalledWith("c1", { name: "Backlog", color: undefined });
    expect(columnMocks.moveColumn).not.toHaveBeenCalled();
  });

  it("reordena sem chamar o update de campos", async () => {
    columnMocks.moveColumn.mockResolvedValue({ id: "c1", position: 2500 });

    const response = await patch({ position: 2500 });

    expect(response.status).toBe(200);
    expect(columnMocks.moveColumn).toHaveBeenCalledWith("c1", { position: 2500, index: undefined });
    expect(columnMocks.updateColumn).not.toHaveBeenCalled();
  });

  it("mover e editar no mesmo PATCH devolve o estado final", async () => {
    columnMocks.moveColumn.mockResolvedValue({ id: "c1", name: "A Fazer", position: 500 });
    columnMocks.updateColumn.mockResolvedValue({ id: "c1", name: "Backlog", position: 500 });

    const response = await patch({ index: 0, name: "Backlog" });

    expect(columnMocks.moveColumn).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ id: "c1", name: "Backlog", position: 500 });
  });

  it("400 quando não há nada a atualizar", async () => {
    expect((await patch({})).status).toBe(400);
    expect(columnMocks.moveColumn).not.toHaveBeenCalled();
    expect(columnMocks.updateColumn).not.toHaveBeenCalled();
  });

  it("nome duplicado vira 409", async () => {
    columnMocks.updateColumn.mockRejectedValue(new Error('Já existe uma coluna chamada "Done"'));

    const response = await patch({ name: "Done" });

    expect(response.status).toBe(409);
    expect(await response.text()).toMatch(/Já existe uma coluna/);
  });

  it("cor inválida vira 400", async () => {
    columnMocks.updateColumn.mockRejectedValue(new Error("Cor inválida: azul (use hex, ex.: #d3e5ef)"));
    expect((await patch({ color: "azul" })).status).toBe(400);
  });
});

describe("DELETE /api/columns/[id]", () => {
  it("exclui coluna vazia", async () => {
    columnMocks.deleteColumn.mockResolvedValue({ id: "c1", name: "Vazia" });

    const response = await del();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "c1", name: "Vazia" });
  });

  it("coluna com card vira 409, com a mensagem do servidor", async () => {
    columnMocks.deleteColumn.mockRejectedValue(
      new Error('Coluna "A Fazer" ainda tem 3 card(s). Mova ou exclua antes de remover a coluna.'),
    );

    const response = await del();

    expect(response.status).toBe(409);
    expect(await response.text()).toMatch(/ainda tem 3 card\(s\)/);
  });

  it("coluna inexistente vira 404", async () => {
    columnMocks.deleteColumn.mockRejectedValue(new Error("Coluna não encontrada: c1"));
    expect((await del()).status).toBe(404);
  });
});
