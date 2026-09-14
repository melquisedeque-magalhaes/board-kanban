"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workflowRequest, type Workflow } from "./workflow-ui";

export function WorkflowsApp() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [externalId, setExternalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const workflows = useQuery({ queryKey: ["workflows"], queryFn: () => workflowRequest<Workflow[]>("/api/workflows") });
  function reset() { setEditing(null); setName(""); setColor("#6366f1"); setExternalId(""); }
  async function save(id?: string, active?: boolean) {
    setBusy(true); setError("");
    try {
      const target = id ?? editing;
      await workflowRequest(`/api/workflows${target ? `/${target}` : ""}`, {
        method: target ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(active !== undefined ? { active } : { name: name.trim(), color, externalId: externalId.trim() || null }),
      });
      if (active === undefined) reset();
      await Promise.all(["workflows", "columns", "card", "ai-activities", "reports", "archived"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      toast.success("Workflow atualizado");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar workflow"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-8">
    <header><Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Voltar ao board</Link><h1 className="mt-3 text-3xl font-bold">Workflows</h1><p className="mt-2 text-sm text-muted-foreground">Cadastre workflows para atribuir atividades aos cards e acompanhar a participação da IA. Este cadastro não dispara automações.</p></header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <section className="rounded-lg border p-5"><h2 className="mb-4 font-semibold">{editing ? "Editar workflow" : "Novo workflow"}</h2>
      <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="grid gap-1 text-xs font-medium">Nome<Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1 text-xs font-medium">Cor<Input type="color" className="w-20 p-1" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label className="grid gap-1 text-xs font-medium sm:col-span-2">Identificador externo (opcional)<Input value={externalId} onChange={(e) => setExternalId(e.target.value)} /></label>
        <div className="flex gap-2 sm:col-span-2">{editing && <Button type="button" variant="ghost" disabled={busy} onClick={reset}>Cancelar edição</Button>}<Button type="submit" disabled={busy || !name.trim()}>{editing ? "Salvar" : "Cadastrar"}</Button></div>
      </form>
    </section>
    {workflows.isPending && <p className="text-sm text-muted-foreground">Carregando workflows…</p>}
    {workflows.isError && <p role="alert" className="text-sm text-destructive">Falha ao carregar workflows. <Button variant="link" onClick={() => workflows.refetch()}>Tentar novamente</Button></p>}
    <section className="grid gap-3" aria-label="Workflows cadastrados">{workflows.data?.map((workflow) => <article key={workflow.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: workflow.color }} />
      <div className="min-w-0 flex-1"><h2 className="break-words font-medium">{workflow.name}</h2><p className="break-all text-xs text-muted-foreground">{workflow.active ? "Ativo" : "Inativo"}{workflow.externalId && ` · ${workflow.externalId}`}</p></div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(workflow.id); setName(workflow.name); setColor(workflow.color); setExternalId(workflow.externalId ?? ""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(workflow.id, !workflow.active)}>{workflow.active ? "Desativar" : "Ativar"}</Button>
    </article>)}{workflows.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum workflow cadastrado.</p>}</section>
    <p className="text-xs text-muted-foreground">Desativar impede novas participações; histórico e execuções em andamento são preservados.</p>
  </main>;
}
