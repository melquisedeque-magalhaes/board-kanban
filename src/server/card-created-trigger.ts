type CreatedCard = {
  id: string;
  code: string | null;
  title: string;
  details: string | null;
  columnId: string;
  createdAt: Date;
};

const timeoutMs = 5_000;

/** Sends the card-created event without making the card creation transactional with Fusion. */
export async function dispatchCardCreated(card: CreatedCard): Promise<void> {
  const endpoint = process.env.FUSION_CARD_CREATED_WEBHOOK_URL?.trim();
  if (!endpoint) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "card.created",
        eventId: `card.created:${card.id}`,
        card: card.id,
        cardData: {
          id: card.id,
          code: card.code,
          title: card.title,
          details: card.details,
          columnId: card.columnId,
          createdAt: card.createdAt.toISOString(),
        },
      }),
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
