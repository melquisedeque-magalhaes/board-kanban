"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CARD_TYPE, PRIORITY } from "./colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

interface ArchivedCard {
  id: string;
  code: string | null;
  title: string;
  priority: "ALTA" | "MEDIA" | "BAIXA" | null;
  type: "BUG" | "FEATURE" | "TAREFA" | null;
  version: string | null;
  archivedAt: string;
  column: { name: string };
}

export function ArchivedDrawer({ open, onClose, onChanged }: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ArchivedCard | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["archived"],
    enabled: open,
    queryFn: async (): Promise<ArchivedCard[]> => {
      const r = await fetch("/api/cards/archived");
      return r.ok ? r.json() : [];
    },
  });

  async function restore(id: string) {
    const res = await fetch(`/api/cards/${id}/archive`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (!res.ok) { toast.error("Falha ao restaurar"); return; }
    toast.success("Card restaurado");
    qc.invalidateQueries({ queryKey: ["archived"] });
    onChanged();
  }

  async function remove() {
    if (!confirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cards/${confirm.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Falha ao excluir"); return; }
      toast.success("Card excluído definitivamente");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["archived"] });
      onChanged();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Archive className="size-4" /> Cards arquivados
          </SheetTitle>
          <SheetDescription>
            Restaure para o board ou exclua definitivamente.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 px-4 pb-6">
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando…
              </div>
            ) : cards.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum card arquivado.</p>
            ) : (
              cards.map((c) => {
                const ty = c.type ? CARD_TYPE[c.type] : null;
                const pr = c.priority ? PRIORITY[c.priority] : null;
                return (
                  <div key={c.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                    <div className="text-sm leading-snug">
                      {c.code ? <span className="font-medium text-muted-foreground">{c.code} · </span> : null}
                      {c.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="border-transparent text-xs font-normal text-muted-foreground">
                        {c.column.name}
                      </Badge>
                      {ty ? (
                        <Badge className="border-transparent font-medium" style={{ background: ty.bg, color: ty.text }}>{ty.label}</Badge>
                      ) : null}
                      {pr ? (
                        <Badge className="border-transparent font-medium" style={{ background: pr.bg, color: pr.text }}>{pr.label}</Badge>
                      ) : null}
                      {c.version ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">v{c.version}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => restore(c.id)}>
                        <ArchiveRestore className="size-3.5" /> Restaurar
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 gap-1.5 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirm(c)}
                      >
                        <Trash2 className="size-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>

      <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir definitivamente?</DialogTitle>
            <DialogDescription>
              {confirm ? `"${confirm.title}" e seus comentários e anexos serão removidos. Esta ação não pode ser desfeita.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
