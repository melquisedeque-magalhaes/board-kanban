"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACTIVITY_NAMES, STATUS_NAMES, WorkflowTags, workflowRequest, type Workflow, type WorkflowActivity } from "./workflow-ui";

const field = "h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm";
const date = (value: string) => new Date(value).toLocaleString("pt-BR");

export function CardWorkflows({ cardId, onChanged }: { cardId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [workflowTagId, setWorkflowTagId] = useState("");
  const [type, setType] = useState<WorkflowActivity["type"]>("DEVELOPED");
  const [status, setStatus] = useState("RUNNING");
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef<{ payload: string; key: string } | null>(null);
  const activities = useQuery({ queryKey: ["ai-activities", cardId], queryFn: () => workflowRequest<WorkflowActivity[]>(`/api/cards/${cardId}/ai-activities`), refetchInterval: 10_000 });
  const workflows = useQuery({ queryKey: ["workflows"], queryFn: () => workflowRequest<Workflow[]>("/api/workflows"), enabled: adding });

  async function save(activityId?: string, result?: string) {
    setBusy(true); setError("");
    try {
      const payload = JSON.stringify({ workflowTagId, type, status, ...(runId.trim() ? { runId: runId.trim() } : {}) });
      if (!submission.current || submission.current.payload !== payload) submission.current = { payload, key: crypto.randomUUID() };
      await workflowRequest(`/api/cards/${cardId}/ai-activities${activityId ? `/${activityId}` : ""}`, {
        method: activityId ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: activityId ? JSON.stringify({ status: result }) : JSON.stringify({ ...JSON.parse(payload), idempotencyKey: submission.current.key }),
      });
      if (!activityId) { submission.current = null; setAdding(false); setRunId(""); }
      await Promise.all(["ai-activities", "card", "columns", "reports", "archived"].map((key) => qc.invalidateQueries({ queryKey: key === "ai-activities" || key === "card" ? [key, cardId] : [key] })));
      onChanged(); toast.success(activityId ? "Resultado registrado" : "Participação registrada");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao registrar participação"); }
    finally { setBusy(false); }
  }

  return <section className="flex flex-col gap-3 px-8 py-5" aria-label="Histórico de workflows">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Workflows e atividades de IA</h2><Button size="sm" variant="ghost" onClick={() => setAdding(!adding)}>Registrar participação</Button></div>
    <p className="text-xs text-muted-foreground">Somente atividades concluídas entram nos relatórios de IA.</p>
    {activities.isPending && <p className="text-sm text-muted-foreground">Carregando histórico…</p>}
    {activities.isError && <div role="alert" className="text-sm text-destructive">Falha ao carregar histórico. <Button variant="link" onClick={() => activities.refetch()}>Tentar novamente</Button></div>}
    {activities.data && <WorkflowTags activities={activities.data} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {adding && <form className="grid gap-3 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="grid gap-1 text-xs">Workflow<select className={field} required value={workflowTagId} onChange={(e) => setWorkflowTagId(e.target.value)}><option value="">Selecione um workflow ativo</option>{workflows.data?.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      {workflows.isError && <p role="alert" className="text-xs text-destructive">Falha ao carregar cadastro. <Button type="button" variant="link" onClick={() => workflows.refetch()}>Tentar novamente</Button></p>}
      <Link href="/workflows" className="text-xs underline">Gerenciar cadastro de workflows</Link>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs">Atividade<select className={field} value={type} onChange={(e) => setType(e.target.value as WorkflowActivity["type"])}>{Object.entries(ACTIVITY_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label className="grid gap-1 text-xs">Estado inicial<select className={field} value={status} onChange={(e) => setStatus(e.target.value)}><option value="RUNNING">Em execução</option><option value="COMPLETED">Concluído</option></select></label></div>
      <label className="grid gap-1 text-xs">ID da execução (opcional)<Input value={runId} onChange={(e) => setRunId(e.target.value)} /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setAdding(false)}>Cancelar</Button><Button type="submit" disabled={busy || !workflowTagId || !workflows.data?.some((w) => w.id === workflowTagId && w.active)}>Registrar</Button></div>
    </form>}
    {activities.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma participação registrada.</p>}
    <ol className="grid gap-2">{[...(activities.data ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map((activity) => <li key={activity.id} className="grid gap-1 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{ACTIVITY_NAMES[activity.type]} · {activity.workflowName ?? activity.workflow?.name ?? activity.workflowId ?? "Workflow não informado"}</span><span>{STATUS_NAMES[activity.status]}</span></div>
      <span className="text-xs text-muted-foreground">Registrado: {date(activity.createdAt)}{activity.startedAt && ` · Início: ${date(activity.startedAt)}`}{activity.finishedAt && ` · Término: ${date(activity.finishedAt)}`}</span>
      {activity.runId && <span className="break-all font-mono text-xs text-muted-foreground">runId: {activity.runId}</span>}
      {activity.status === "RUNNING" && <div className="mt-1 flex flex-wrap gap-1">{(["COMPLETED", "FAILED", "CANCELLED"] as const).map((result) => <Button key={result} size="sm" variant="outline" disabled={busy} onClick={() => save(activity.id, result)}>{result === "COMPLETED" ? "Concluir" : result === "FAILED" ? "Registrar falha" : "Cancelar execução"}</Button>)}</div>}
    </li>)}</ol>
  </section>;
}
