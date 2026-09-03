import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/cards", () => ({ listColumns: vi.fn().mockResolvedValue([]) }));
const createColumn = vi.hoisted(() => vi.fn());
vi.mock("@/server/columns", () => ({ createColumn }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/columns", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/columns", () => {
  it("cria a coluna e devolve 201", async () => {
    createColumn.mockResolvedValue({ id: "c9", name: "Code Review", color: "#d3e5ef" });

    const response = await post({ name: "Code Review", color: "#d3e5ef" });

    expect(response.status).toBe(201);
    expect(createColumn).toHaveBeenCalledWith({ name: "Code Review", color: "#d3e5ef" });
  });

  it("400 sem nome", async () => {
    expect((await post({})).status).toBe(400);
    expect(createColumn).not.toHaveBeenCalled();
  });

  it("nome duplicado devolve a mensagem do servidor, não 500", async () => {
    createColumn.mockRejectedValue(new Error('Já existe uma coluna chamada "A Fazer"'));

    const response = await post({ name: "A Fazer" });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/Já existe uma coluna/);
  });
});
