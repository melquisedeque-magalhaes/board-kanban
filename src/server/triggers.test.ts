import { describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ workflowTrigger: {
  findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
} }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { createTrigger, validateWebhookUrl } from "./triggers";

describe("validateWebhookUrl", () => {
  it("aceita somente webhook HTTPS oficial do Fusion", () => {
    expect(validateWebhookUrl("https://fusion-agents-dev.brq.com/api/hooks/abc123")).toBe(true);
    expect(validateWebhookUrl("https://fusion-agents.brq.com/api/hooks/abc123")).toBe(true);
  });

  it("recusa destinos fora do endpoint permitido", () => {
    expect(validateWebhookUrl("http://fusion-agents-dev.brq.com/api/hooks/abc123")).toBe(false);
    expect(validateWebhookUrl("https://example.com/api/hooks/abc123")).toBe(false);
    expect(validateWebhookUrl("https://fusion-agents-dev.brq.com/api/hooks/")).toBe(false);
  });

  it("rejeita o mesmo evento e webhook mais de uma vez", async () => {
    dbMock.workflowTrigger.findFirst.mockResolvedValue({ id: "existing" });

    await expect(createTrigger({
      name: "Fase 0",
      event: "card.moved",
      webhookUrl: "https://fusion-agents-dev.brq.com/api/hooks/token",
    })).rejects.toThrow("Já existe um trigger para este evento e webhook");
    expect(dbMock.workflowTrigger.create).not.toHaveBeenCalled();
  });
});
