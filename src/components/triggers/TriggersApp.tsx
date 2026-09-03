"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Power, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Trigger = { id: string; name: string; event: string; webhookUrl: string; enabled: boolean };

export function TriggersApp() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [name, setName] = useState("");
  const [event, setEvent] = useState("card.created");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/triggers");
    if (res.ok) setTriggers(await res.json());
    else toast.error(res.status === 403 ? "Acesso restrito a usuários autenticados" : "Falha ao carregar triggers");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/triggers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, event, webhookUrl }) });
    if (!res.ok) { toast.error(await res.text()); return; }
    setName(""); setWebhookUrl(""); toast.success("Trigger criado"); load();
  }
  async function toggle(trigger: Trigger) {
    await fetch(`/api/triggers/${trigger.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !trigger.enabled }) });
    load();
  }
  async function remove(trigger: Trigger) {
    if (!window.confirm(`Excluir o trigger ${trigger.name}?`)) return;
    await fetch(`/api/triggers/${trigger.id}`, { method: "DELETE" });
    load();
  }

  return <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-8">
    <header className="flex items-start justify-between">
      <div>
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Voltar ao board</Link>
        <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold tracking-tight"><Zap className="size-7" /> Triggers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Automações do Board Kanban e destinos de workflow.</p>
      </div>
    </header>
    <Card>
      <CardHeader><CardTitle className="text-base">Novo trigger</CardTitle></CardHeader>
      <CardContent><form onSubmit={create} className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
        <label className="grid gap-1 text-xs font-medium">Nome<Input id="trigger-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fase 0 ao criar card" /></label>
        <label className="grid gap-1 text-xs font-medium">Evento<select id="trigger-event" className="h-8 rounded-lg border border-input bg-background px-2 text-sm" value={event} onChange={(e) => setEvent(e.target.value)}><option value="card.created">Card criado</option></select></label>
        <label className="grid gap-1 text-xs font-medium">Webhook do Fusion<Input id="trigger-webhook-url" type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://fusion-agents-dev.brq.com/api/hooks/..." /></label>
        <Button id="trigger-create" type="submit" disabled={loading || !name.trim() || !webhookUrl.trim()}>Adicionar</Button>
      </form></CardContent>
    </Card>
    <section className="grid gap-3">
      {triggers.map((trigger) => <Card key={trigger.id}><CardContent className="flex items-center gap-3 py-4">
        <div className={`size-2.5 rounded-full ${trigger.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
        <div className="min-w-0 flex-1"><div className="font-medium">{trigger.name}</div><div className="truncate text-xs text-muted-foreground">{trigger.event} · {trigger.webhookUrl}</div></div>
        <Button id={`trigger-toggle-${trigger.id}`} variant="ghost" size="icon" title={trigger.enabled ? "Desativar" : "Ativar"} onClick={() => toggle(trigger)}><Power /></Button>
        <Button id={`trigger-delete-${trigger.id}`} variant="ghost" size="icon" title="Excluir" onClick={() => remove(trigger)}><Trash2 /></Button>
      </CardContent></Card>)}
      {!loading && triggers.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum trigger configurado.</p>}
    </section>
  </main>;
}
