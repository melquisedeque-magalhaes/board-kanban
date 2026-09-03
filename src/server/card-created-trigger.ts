import { db } from "@/lib/db";

type CreatedCard = {
  id: string;
};

const timeoutMs = 5_000;

/** Sends the card-created event without making the card creation transactional with Fusion. */
export async function dispatchCardCreated(card: CreatedCard): Promise<void> {
  const triggers = await db.workflowTrigger.findMany({ where: { event: "card.created", enabled: true }, select: { webhookUrl: true } });
  const endpoints = triggers.map((trigger) => trigger.webhookUrl);
  if (!endpoints.length) return;
  await Promise.all(endpoints.map((endpoint) => dispatchToEndpoint(endpoint, card)));
}

async function dispatchToEndpoint(endpoint: string, card: CreatedCard): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "card.created", eventId: `card.created:${card.id}`, card: card.id }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`card.created webhook returned HTTP ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`card.created webhook failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
