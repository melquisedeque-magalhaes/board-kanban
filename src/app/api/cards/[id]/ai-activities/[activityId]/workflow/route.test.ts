import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), link: vi.fn() }));
vi.mock("@/server/auth-guard", () => ({ requireUser: mocks.auth }));
vi.mock("@/server/ai-activities", () => ({ linkAiActivityWorkflow: mocks.link }));
import { DomainError } from "@/server/workflows";
import { POST } from "./route";

const context = { params: Promise.resolve({ id: "card-url", activityId: "activity-url" }) };
const post = (body: string) => POST(new Request("http://x", { method: "POST", body }), context);

beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue(null); });

describe("POST vínculo workflow", () => {
  it("exige sessão antes de ler JSON ou chamar domínio", async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await post("{")).status).toBe(401);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it.each(["{", "null", "[]", "{}", '{"workflowTagId":""}', '{"workflowTagId":"w1","applyToAll":"true"}', '{"workflowTagId":"w1","cardId":"other"}'])("recusa payload inválido %s", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("usa IDs da URL e aplica somente à atividade por padrão", async () => {
    const result = { activity: { id: "activity-url" }, updatedCount: 1, defaultApplied: false };
    mocks.link.mockResolvedValue(result);
    const response = await post('{"workflowTagId":"w1"}');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(mocks.link).toHaveBeenCalledWith("card-url", "activity-url", { workflowTagId: "w1", applyToAll: false });
  });
  it("encaminha aplicação global somente quando true explícito", async () => {
    mocks.link.mockResolvedValue({ updatedCount: 3, defaultApplied: true });
    await post('{"workflowTagId":"w1","applyToAll":true}');
    expect(mocks.link).toHaveBeenCalledWith("card-url", "activity-url", { workflowTagId: "w1", applyToAll: true });
  });
  it.each([400, 404, 409])("preserva status %s do domínio", async (status) => {
    mocks.link.mockRejectedValue(new DomainError("Vínculo recusado", status));
    const response = await post('{"workflowTagId":"w1"}');
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Vínculo recusado" });
  });
  it("não expõe detalhes internos em 500", async () => {
    mocks.link.mockRejectedValue(new Error("postgres://secret"));
    const response = await post('{"workflowTagId":"w1"}');
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
