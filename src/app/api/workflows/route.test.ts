import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), start: vi.fn(), finish: vi.fn(), history: vi.fn() }));
vi.mock("@/server/auth-guard", () => ({ requireUser: mocks.auth }));
vi.mock("@/server/workflows", () => ({
  listWorkflows: mocks.list, createWorkflow: mocks.create, updateWorkflow: mocks.update,
  DomainError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("@/server/ai-activities", () => ({ startAiActivity: mocks.start, finishAiActivity: mocks.finish, listAiActivities: mocks.history }));
import { DomainError } from "@/server/workflows";
import { GET, POST } from "./route";
import { PATCH as update } from "./[id]/route";
import { GET as history, POST as start } from "../cards/[id]/ai-activities/route";
import { PATCH as finish } from "../cards/[id]/ai-activities/[activityId]/route";

const req = (body = "{}") => new Request("http://x", { method: "POST", body });
const card = { params: Promise.resolve({ id: "card1" }) };
const activity = { params: Promise.resolve({ id: "card1", activityId: "a1" }) };
const calls = () => [() => GET(), () => POST(req()), () => update(req(), card), () => history(req(), card), () => start(req(), card), () => finish(req(), activity)];

beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue(null); });

describe("REST workflows e atividades", () => {
  it("protege todas as operações sem executar domínio", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    for (const call of calls()) expect((await call()).status).toBe(401);
    for (const fn of [mocks.list, mocks.create, mocks.update, mocks.start, mocks.finish, mocks.history]) expect(fn).not.toHaveBeenCalled();
  });
  it("JSON inválido retorna 400 em todas as mutações", async () => {
    for (const call of [() => POST(req("{")), () => update(req("{"), card), () => start(req("{"), card), () => finish(req("{"), activity)]) expect((await call()).status).toBe(400);
  });
  it("recusa corpo nulo e resultado não terminal antes de chamar domínio", async () => {
    expect((await start(req("null"), card)).status).toBe(400);
    expect((await finish(req("null"), activity)).status).toBe(400);
    expect((await finish(req('{"status":"RUNNING"}'), activity)).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("retorna cadastro e encaminha edição", async () => {
    mocks.list.mockResolvedValue([{ id: "w1" }]);
    mocks.create.mockResolvedValue({ id: "w1" });
    mocks.update.mockResolvedValue({ id: "card1", active: false });
    expect(await (await GET()).json()).toEqual([{ id: "w1" }]);
    expect((await POST(req('{"name":"QA","color":"#123456"}'))).status).toBe(201);
    await update(req('{"active":false}'), card);
    expect(mocks.update).toHaveBeenCalledWith("card1", { active: false });
  });
  it("usa card da URL, devolve histórico e encerra execução específica", async () => {
    mocks.start.mockResolvedValue({ id: "a1" }); mocks.finish.mockResolvedValue({ id: "a1" }); mocks.history.mockResolvedValue([]);
    await start(req('{"cardId":"other","workflowTagId":"w1","type":"CREATED","idempotencyKey":"k"}'), card);
    expect(mocks.start).toHaveBeenCalledWith({ cardId: "card1", workflowTagId: "w1", type: "CREATED", idempotencyKey: "k" });
    await history(req(), card); expect(mocks.history).toHaveBeenCalledWith("card1");
    await finish(req('{"status":"COMPLETED"}'), activity); expect(mocks.finish).toHaveBeenCalledWith("card1", "a1", "COMPLETED");
  });
  it.each([400, 404, 409])("preserva erro de domínio %s", async (status) => {
    mocks.create.mockRejectedValue(new DomainError("Falha de domínio", status));
    expect((await POST(req())).status).toBe(status);
  });
  it("erro interno retorna 500 sem expor dados privados", async () => {
    mocks.list.mockRejectedValue(new Error("postgres://password"));
    const response = await GET();
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("postgres");
  });
});
