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
async function ensureTriggerIsUnique(event: TriggerEvent, webhookUrl: string, excludeId?: string) {
  const duplicate = await db.workflowTrigger.findFirst({
    where: { event, webhookUrl, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new Error("Já existe um trigger para este evento e webhook");
}
export async function createTrigger(input: { name: string; event: TriggerEvent; webhookUrl: string }) {
  if (!validateWebhookUrl(input.webhookUrl)) throw new Error("URL deve ser um webhook oficial do Fusion Agents");
  const webhookUrl = input.webhookUrl.trim();
  await ensureTriggerIsUnique(input.event, webhookUrl);
  return db.workflowTrigger.create({ data: { name: input.name.trim(), event: input.event, webhookUrl } });
}
export async function updateTrigger(id: string, input: { name?: string; event?: TriggerEvent; webhookUrl?: string; enabled?: boolean }) {
  if (input.webhookUrl !== undefined && !validateWebhookUrl(input.webhookUrl)) throw new Error("URL deve ser um webhook oficial do Fusion Agents");
  if (input.event !== undefined || input.webhookUrl !== undefined) {
    const current = await db.workflowTrigger.findUnique({ where: { id }, select: { event: true, webhookUrl: true } });
    if (current) await ensureTriggerIsUnique(input.event ?? current.event as TriggerEvent, input.webhookUrl?.trim() ?? current.webhookUrl, id);
  }
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
