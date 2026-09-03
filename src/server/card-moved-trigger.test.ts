import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ workflowTrigger: { findMany: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { dispatchCardMoved } from "./card-moved-trigger";

describe("dispatchCardMoved", () => {
  afterEach(() => vi.restoreAllMocks());

  it("envia origem e destino para os triggers ativos", async () => {
    dbMock.workflowTrigger.findMany.mockResolvedValue([{ webhookUrl: "https://fusion-agents-dev.brq.com/api/hooks/token" }]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

    await dispatchCardMoved("card1", { id: "dev", name: "Desenvolvimento" }, { id: "test", name: "Aguardando Teste" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fusion-agents-dev.brq.com/api/hooks/token",
      expect.objectContaining({
        body: JSON.stringify({
          event: "card.moved",
          eventId: "card.moved:card1:dev:test",
          card: "card1",
          fromColumn: { id: "dev", name: "Desenvolvimento" },
          toColumn: { id: "test", name: "Aguardando Teste" },
        }),
      }),
    );
  });

  it("não propaga erro do webhook", async () => {
    dbMock.workflowTrigger.findMany.mockResolvedValue([{ webhookUrl: "https://fusion-agents-dev.brq.com/api/hooks/token" }]);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchCardMoved("card1", { id: "dev", name: "Desenvolvimento" }, { id: "test", name: "Aguardando Teste" })).resolves.toBeUndefined();
  });
});
