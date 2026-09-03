import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ workflowTrigger: { findMany: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { dispatchCardCreated } from "./card-created-trigger";

const card = {
  id: "card1",
};

describe("dispatchCardCreated", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("não chama Fusion quando o endpoint não está configurado", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await dispatchCardCreated(card);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia o evento e o ID do card para cada trigger ativo", async () => {
    dbMock.workflowTrigger.findMany.mockResolvedValue([{ webhookUrl: "https://fusion-agents-dev.brq.com/api/hooks/token" }]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

    await dispatchCardCreated(card);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fusion-agents-dev.brq.com/api/hooks/token",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "card.created",
          eventId: "card.created:card1",
          card: "card1",
        }),
      }),
    );
  });

  it("não falha a operação quando o webhook retorna erro", async () => {
    dbMock.workflowTrigger.findMany.mockResolvedValue([{ webhookUrl: "https://fusion-agents-dev.brq.com/api/hooks/token" }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const errorMock = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchCardCreated(card)).resolves.toBeUndefined();

    expect(errorMock).toHaveBeenCalledWith("card.created webhook returned HTTP 500");
  });
});
