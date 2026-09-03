import { db } from "@/lib/db";

type ColumnRef = { id: string; name: string };

const timeoutMs = 5_000;

/** Sends a cross-column card move after the database transaction has committed. */
export async function dispatchCardMoved(cardId: string, fromColumn: ColumnRef, toColumn: ColumnRef): Promise<void> {
  const triggers = await db.workflowTrigger.findMany({ where: { event: "card.moved", enabled: true }, select: { webhookUrl: true } });
  await Promise.all(triggers.map(({ webhookUrl }) => dispatchToEndpoint(webhookUrl, cardId, fromColumn, toColumn)));
}

async function dispatchToEndpoint(endpoint: string, cardId: string, fromColumn: ColumnRef, toColumn: ColumnRef): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "card.moved",
        eventId: `card.moved:${cardId}:${fromColumn.id}:${toColumn.id}`,
        card: cardId,
        fromColumn,
        toColumn,
      }),
      signal: controller.signal,
    });
    if (!response.ok) console.error(`card.moved webhook returned HTTP ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`card.moved webhook failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
