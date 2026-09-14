import { Badge } from "@/components/ui/badge";

export type Workflow = { id: string; name: string; color: string; active: boolean; externalId?: string | null };
export const ACTIVITY_NAMES = { CREATED: "Criação", ANALYZED: "Análise", DEVELOPED: "Desenvolvimento", TESTED: "Testes", REVIEWED: "Code review" };
export const STATUS_NAMES = { RUNNING: "Em execução", COMPLETED: "Concluído", FAILED: "Falhou", CANCELLED: "Cancelado" };
export type WorkflowActivity = {
  id: string; type: keyof typeof ACTIVITY_NAMES; status: keyof typeof STATUS_NAMES;
  workflow?: Workflow | null; workflowName?: string | null; workflowId?: string | null;
  workflowTagId?: string | null;
  runId?: string | null; createdAt: string; startedAt?: string | null; finishedAt?: string | null;
};

export async function workflowRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.error === "string" ? payload.error : "Não foi possível salvar ou carregar workflows. Tente novamente.");
  }
  return response.json();
}

export function workflowTags(activities: WorkflowActivity[]) {
  const tags = new Map<string, { id: string; name: string; color: string; running: boolean }>();
  for (const activity of activities) {
    const id = activity.workflow?.id ? `registered:${activity.workflow.id}` : activity.workflowId ? `external:${activity.workflowId}` : "legacy";
    const previous = tags.get(id);
    tags.set(id, {
      id, name: activity.workflow?.name ?? activity.workflowName ?? (activity.workflowId ? `${activity.workflowId} (legado)` : "Workflow não informado"),
      color: activity.workflow?.color ?? "#64748b", running: previous?.running === true || activity.status === "RUNNING",
    });
  }
  return [...tags.values()];
}

export function WorkflowTags({ activities }: { activities: WorkflowActivity[] }) {
  return <div className="flex flex-wrap gap-1.5" aria-label="Workflows participantes">
    {workflowTags(activities).map((tag) => <Badge key={tag.id} variant="outline" className="max-w-full gap-1.5 text-[11px]" style={{ borderColor: tag.color }} title={`${tag.name}${tag.running ? " · Em execução" : " · Histórico"}`}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
      <span className="truncate">{tag.name}</span>{tag.running && <span className="shrink-0">· Em execução</span>}
    </Badge>)}
  </div>;
}
