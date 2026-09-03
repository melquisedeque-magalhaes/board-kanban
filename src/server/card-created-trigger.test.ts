import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchCardCreated } from "./card-created-trigger";

const card = {
  id: "card1",
  code: "TI-900",
  title: "Novo card",
  details: "Detalhes",
  columnId: "col1",
  createdAt: new Date("2026-09-03T22:00:00.000Z"),
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

  it("envia o evento e o ID do card para o webhook configurado", async () => {
    vi.stubEnv("FUSION_CARD_CREATED_WEBHOOK_URL", "https://fusion.test/api/hooks/token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

    await dispatchCardCreated(card);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fusion.test/api/hooks/token",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "card.created",
          eventId: "card.created:card1",
          card: "card1",
          cardData: {
            id: "card1",
            code: "TI-900",
            title: "Novo card",
            details: "Detalhes",
            columnId: "col1",
            createdAt: "2026-09-03T22:00:00.000Z",
          },
        }),
      }),
    );
  });

  it("não falha a operação quando o webhook retorna erro", async () => {
    vi.stubEnv("FUSION_CARD_CREATED_WEBHOOK_URL", "https://fusion.test/api/hooks/token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const errorMock = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchCardCreated(card)).resolves.toBeUndefined();

    expect(errorMock).toHaveBeenCalledWith("card.created webhook returned HTTP 500");
  });
});
