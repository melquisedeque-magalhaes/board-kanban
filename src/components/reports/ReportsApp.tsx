"use client";
import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, UserX } from "lucide-react";
import type { DeliveryReport } from "@/server/reports";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { avatarColor, initials, columnSwatch, PRIORITY, CARD_TYPE } from "@/components/board/colors";

const TYPE_LABEL: Record<string, string> = { ...Object.fromEntries(Object.entries(CARD_TYPE).map(([k, v]) => [k, v.label])), SEM_TIPO: "Sem tipo" };
const PRIO_LABEL: Record<string, string> = { ...Object.fromEntries(Object.entries(PRIORITY).map(([k, v]) => [k, v.label])), SEM_PRIORIDADE: "Sem prioridade" };
// Dots saturados do relatório (mais fortes que os swatches pastel do board).
const TYPE_DOT: Record<string, string> = { FEATURE: "#5b8def", BUG: "#e5715f", TAREFA: "#3aa675", SUBTASK: "#8d6ecf", SEM_TIPO: "#b8b6b1" };
const PRIO_DOT: Record<string, string> = { CRITICA: "#e5484d", ALTA: "#e8926a", MEDIA: "#e0b13e", BAIXA: "#b8b6b1", SEM_PRIORIDADE: "#c7c6c3" };
const typeColor = (k: string) => TYPE_DOT[k] ?? "#b8b6b1";
const prioColor = (k: string) => PRIO_DOT[k] ?? "#b8b6b1";

function StatCard({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone?: "done" | "wip" | "danger" | "muted";
}) {
  const t = {
    done: { box: "bg-emerald-500/10", icon: "text-emerald-600 dark:text-emerald-400", num: "text-emerald-700 dark:text-emerald-400" },
    wip: { box: "bg-sky-500/10", icon: "text-sky-600 dark:text-sky-400", num: "text-sky-700 dark:text-sky-400" },
    danger: { box: "bg-red-500/10", icon: "text-red-600 dark:text-red-400", num: "text-red-700 dark:text-red-400" },
    muted: { box: "bg-muted", icon: "text-muted-foreground", num: "text-foreground" },
  }[tone ?? "muted"];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${t.box} ${t.icon}`}>{icon}</div>
        <div className="flex flex-col">
          <span className={`text-2xl font-bold tabular-nums leading-none ${t.num}`}>{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Barra empilhada entregue (verde) + WIP (âmbar), escalada pelo máximo da série.
function StackedBar({ delivered, wip, max }: { delivered: number; wip: number; max: number }) {
  const pct = (n: number) => (max > 0 ? (n / max) * 100 : 0);
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full" style={{ width: `${pct(delivered)}%`, background: "#3aa675" }} title={`${delivered} entregue(s)`} />
      <div className="h-full" style={{ width: `${pct(wip)}%`, background: "#e8a72f" }} title={`${wip} em andamento`} />
    </div>
  );
}

function BreakdownList({ title, rows, color, labels }: {
  title: string;
  rows: { key: string; delivered: number; wip: number }[];
  color: (k: string) => string;
  labels: Record<string, string>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.delivered + r.wip));
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="size-2.5 rounded-full" style={{ background: color(r.key) }} />
                {labels[r.key] ?? r.key}
              </span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{r.delivered}</span>
                {" · "}{r.wip} WIP
              </span>
            </div>
            <StackedBar delivered={r.delivered} wip={r.wip} max={max} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReportsApp({ initial }: { initial: DeliveryReport }) {
  const qc = useQueryClient();
  // Relatório puxa todos os cards (query pesada) — não pollamos ele direto.
  const { data: r } = useQuery<DeliveryReport>({
    queryKey: ["reports"],
    queryFn: () => fetch("/api/reports").then((res) => res.json()),
    initialData: initial,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  // Poll barato da versão do board; só refetcha o relatório quando algo muda.
  const prevVersion = useRef<string | undefined>(undefined);
  useQuery({
    queryKey: ["board-version"],
    queryFn: async () => {
      const v = (await fetch("/api/board/version").then((res) => res.json())).version as string;
      if (prevVersion.current !== undefined && prevVersion.current !== v) {
        qc.invalidateQueries({ queryKey: ["reports"] });
      }
      prevVersion.current = v;
      return v;
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const maxPerson = Math.max(1, ...r.perPerson.map((p) => p.delivered + p.wip));
  const maxCol = Math.max(1, ...r.byColumn.map((c) => c.count));
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar ao board
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Entregas e distribuição de cards do time · atualizado {new Date(r.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <ThemeToggle />
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<CheckCircle2 className="size-5" />} label="Entregues" value={r.totals.delivered} tone="done" />
        <StatCard icon={<Loader2 className="size-5" />} label="Em andamento" value={r.totals.wip} tone="wip" />
        <StatCard icon={<AlertTriangle className="size-5" />} label="Vencidos" value={r.totals.overdue} tone="danger" />
        <StatCard icon={<UserX className="size-5" />} label="Sem responsável" value={r.totals.unassignedWip} tone="muted" />
      </div>

      {/* Entregas por pessoa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Entregas por pessoa</CardTitle>
          <p className="text-xs text-muted-foreground">
            <span className="mr-3 inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-500" /> entregue</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-amber-400" /> em andamento</span>
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {r.perPerson.length === 0 && <p className="text-sm text-muted-foreground">Nenhum card atribuído ainda.</p>}
          {r.perPerson.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <Avatar className="size-8 shrink-0">
                {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.name} className="object-cover" /> : null}
                <AvatarFallback className="text-[11px] font-semibold text-white" style={{ background: avatarColor(p.name) }}>
                  {initials(p.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{p.delivered}</span> entregue
                    {" · "}{p.wip} WIP
                    {p.overdue > 0 && <span className="ml-1 font-semibold text-red-600 dark:text-red-400">{p.overdue} venc.</span>}
                  </span>
                </div>
                <StackedBar delivered={p.delivered} wip={p.wip} max={maxPerson} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Distribuição por coluna */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Distribuição por coluna (cards ativos)</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {r.byColumn.map((c) => {
            const sw = columnSwatch(c.name);
            return (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 truncate text-xs font-medium" title={c.name}>{c.name}</span>
                <div className="flex h-5 flex-1 items-center overflow-hidden rounded bg-muted">
                  <div className="flex h-full items-center rounded" style={{ width: `${(c.count / maxCol) * 100}%`, background: sw.bg, minWidth: c.count ? "1.5rem" : 0 }}>
                    {c.count > 0 && <span className="px-2 text-[11px] font-semibold tabular-nums" style={{ color: sw.text }}>{c.count}</span>}
                  </div>
                  {c.count === 0 && <span className="px-2 text-[11px] text-muted-foreground">0</span>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Tipo & Prioridade */}
      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownList title="Por tipo" rows={r.byType} color={typeColor} labels={TYPE_LABEL} />
        <BreakdownList title="Por prioridade" rows={r.byPriority} color={prioColor} labels={PRIO_LABEL} />
      </div>

      {/* Vencidos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-1.5">
            <AlertTriangle className="size-4 text-red-500" /> Cards vencidos ({r.overdueCards.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {r.overdueCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum card vencido. 🎉</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {r.overdueCards.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {c.code && <span className="mr-1.5 text-xs text-muted-foreground">{c.code}</span>}{c.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.columnName}{c.assignees.length > 0 && ` · ${c.assignees.map((a) => a.name).join(", ")}`}
                    </span>
                  </div>
                  <span className="shrink-0 rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                    {fmtDate(c.dueDate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
