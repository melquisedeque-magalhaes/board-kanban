import { db } from "@/lib/db";

export const TRIGGER_EVENTS = ["card.created", "card.moved"] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

const ALLOWED_WEBHOOK_HOSTS = new Set(["fusion-agents-dev.brq.com", "fusion-agents.brq.com"]);

export function validateWebhookUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !ALLOWED_WEBHOOK_HOSTS.has(url.hostname) || !url.pathname.startsWith("/api/hooks/")) return false;
    return url.pathname.length > "/api/hooks/".length;
  } catch { return false; }
}

export function listTriggers() { return db.workflowTrigger.findMany({ orderBy: { createdAt: "desc" } }); }
export function createTrigger(input: { name: string; event: TriggerEvent; webhookUrl: string }) {
  if (!validateWebhookUrl(input.webhookUrl)) throw new Error("URL deve ser um webhook oficial do Fusion Agents");
  return db.workflowTrigger.create({ data: { name: input.name.trim(), event: input.event, webhookUrl: input.webhookUrl.trim() } });
}
export function updateTrigger(id: string, input: { name?: string; event?: TriggerEvent; webhookUrl?: string; enabled?: boolean }) {
  if (input.webhookUrl !== undefined && !validateWebhookUrl(input.webhookUrl)) throw new Error("URL deve ser um webhook oficial do Fusion Agents");
  return db.workflowTrigger.update({ where: { id }, data: {
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.event !== undefined && { event: input.event }),
    ...(input.webhookUrl !== undefined && { webhookUrl: input.webhookUrl.trim() }),
    ...(input.enabled !== undefined && { enabled: input.enabled }),
  } });
}
export function deleteTrigger(id: string) { return db.workflowTrigger.delete({ where: { id } }); }
export function publicTrigger(trigger: Awaited<ReturnType<typeof listTriggers>>[number]) {
  return { ...trigger, webhookUrl: trigger.webhookUrl.replace(/(https?:\/\/[^/]+\/api\/hooks\/).+/, "$1••••••") };
}
