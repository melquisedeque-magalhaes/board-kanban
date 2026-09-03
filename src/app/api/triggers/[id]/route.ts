import { NextResponse } from "next/server";
import { deleteTrigger, publicTrigger, updateTrigger, TRIGGER_EVENTS, validateWebhookUrl } from "@/server/triggers";
import { requireAdmin } from "@/server/admin-guard";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireAdmin();
  if (unauth) return unauth;
  const body = await req.json();
  if (body.event !== undefined && !TRIGGER_EVENTS.includes(body.event)) return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
  if (body.webhookUrl !== undefined && !validateWebhookUrl(body.webhookUrl)) return NextResponse.json({ error: "URL deve ser um webhook oficial do Fusion Agents" }, { status: 400 });
  return NextResponse.json(publicTrigger(await updateTrigger((await params).id, body)));
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireAdmin();
  if (unauth) return unauth;
  await deleteTrigger((await params).id);
  return NextResponse.json({ ok: true });
}
