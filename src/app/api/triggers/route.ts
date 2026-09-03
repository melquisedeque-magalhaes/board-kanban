import { NextResponse } from "next/server";
import { createTrigger, listTriggers, publicTrigger, TRIGGER_EVENTS, validateWebhookUrl } from "@/server/triggers";
import { requireAuthenticated } from "@/server/admin-guard";

export async function GET() {
  const unauth = await requireAuthenticated();
  if (unauth) return unauth;
  return NextResponse.json((await listTriggers()).map(publicTrigger));
}
export async function POST(req: Request) {
  const unauth = await requireAuthenticated();
  if (unauth) return unauth;
  const body = await req.json();
  if (!body.name?.trim() || !TRIGGER_EVENTS.includes(body.event) || !body.webhookUrl?.trim() || !validateWebhookUrl(body.webhookUrl)) {
    return NextResponse.json({ error: "Nome, evento e URL do webhook são obrigatórios" }, { status: 400 });
  }
  return NextResponse.json(publicTrigger(await createTrigger(body)), { status: 201 });
}
