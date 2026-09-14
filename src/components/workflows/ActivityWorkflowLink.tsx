"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { canLinkWorkflow } from "./activity-workflow-link";
import { ACTIVITY_NAMES, workflowRequest, type Workflow, type WorkflowActivity } from "./workflow-ui";

export function ActivityWorkflowLink({ activity, cardId, onChanged }: { activity: WorkflowActivity; cardId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [workflowTagId, setWorkflowTagId] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const workflows = useQuery({ queryKey: ["workflows"], queryFn: () => workflowRequest<Workflow[]>("/api/workflows"), enabled: open });
  const eligible = canLinkWorkflow(activity);
  const activeWorkflows = workflows.data?.filter((workflow) => workflow.active) ?? [];

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await workflowRequest<{ activity: WorkflowActivity; updatedCount: number; defaultApplied: boolean }>(`/api/cards/${cardId}/ai-activities/${activity.id}/workflow`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowTagId, applyToAll }),
      });
      await Promise.all(["ai-activities", "card", "columns", "reports", "archived", "workflows"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      setOpen(false); onChanged();
      toast.success(result.defaultApplied ? `Workflow padrão definido. ${result.updatedCount} atividade(s) vinculada(s).` : "Workflow vinculado à atividade");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível vincular o workflow. Tente novamente."); }
    finally { setBusy(false); }
  }

  if (!eligible) return <span>{activity.workflowName ?? activity.workflow?.name ?? activity.workflowId ?? activity.workflowTagId ?? "Workflow identificado"}</span>;

  return <Popover open={open} onOpenChange={(value) => {
    if (busy) return;
    if (value) { setWorkflowTagId(""); setApplyToAll(false); setError(""); }
    setOpen(value);
  }}>
    <PopoverTrigger asChild><button type="button" className="rounded-sm text-left underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Vincular workflow à atividade de ${ACTIVITY_NAMES[activity.type]}`}>Workflow não informado</button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
      <form className="grid gap-3" onSubmit={save}>
        <h3 className="text-sm font-semibold">Workflow de {ACTIVITY_NAMES[activity.type]}</h3>
        <label className="grid gap-1 text-xs">Workflow ativo<select required value={workflowTagId} disabled={busy || workflows.isPending || workflows.isError} onChange={(event) => setWorkflowTagId(event.target.value)} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecione um workflow</option>{activeWorkflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
        {workflows.isPending && <p className="text-xs text-muted-foreground">Carregando workflows…</p>}
        {workflows.isError && <p role="alert" className="text-xs text-destructive">Falha ao carregar workflows. <Button type="button" variant="link" size="sm" onClick={() => workflows.refetch()}>Tentar novamente</Button></p>}
        {workflows.isSuccess && activeWorkflows.length === 0 && <p className="text-xs text-muted-foreground">Nenhum workflow ativo. <Link href="/workflows" className="underline">Gerenciar workflows</Link></p>}
        <label className="flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" className="mt-1 shrink-0" checked={applyToAll} disabled={busy} onChange={(event) => setApplyToAll(event.target.checked)} /><span>Aplicar a todas as atividades de {ACTIVITY_NAMES[activity.type]} sem workflow e usar nas próximas</span></label>
        <p className="text-xs text-muted-foreground">Ao marcar, serão incluídos todos os cards, inclusive arquivados. O padrão será usado nas próximas atividades de {ACTIVITY_NAMES[activity.type]} sem identificação de workflow. Vínculos existentes serão preservados.</p>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" size="sm" disabled={busy || !eligible || workflows.isError || !activeWorkflows.some((workflow) => workflow.id === workflowTagId)}>{busy ? "Salvando…" : "Salvar vínculo"}</Button></div>
      </form>
    </PopoverContent>
  </Popover>;
}
