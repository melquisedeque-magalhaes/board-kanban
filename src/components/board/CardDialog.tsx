"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import type { ColumnData } from "./Column";
import type { UserLite } from "./Chrome";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DRAFT_KEY = "cardDraft";

interface Draft { title?: string; priority?: string; type?: string; version?: string; requestedBy?: string }

function readDraft(): Draft {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch { return {}; }
}

export function CardDialog({ columns, users, initialColumnId, onClose, onCreated }: {
  columns: ColumnData[];
  users: UserLite[];
  initialColumnId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const draft = readDraft();
  const [columnId, setColumnId] = useState(initialColumnId);
  const [title, setTitle] = useState(draft.title ?? "");
  const [priority, setPriority] = useState(draft.priority ?? "");
  const [type, setType] = useState(draft.type ?? "");
  const [version, setVersion] = useState(draft.version ?? "");
  const [requestedBy, setRequestedBy] = useState(draft.requestedBy ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [reservedCode, setReservedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reserva a chave uma vez, ao abrir o dialog. Cancelar deixa furo no
  // sequencial (aceito — ver spec TI-129).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/cards/reserve-code", { method: "POST" });
        if (alive && r.ok) setReservedCode((await r.json()).code);
      } catch { /* offline — cria sem prévia, backend gera no create */ }
    })();
    return () => { alive = false; };
  }, []);

  async function copyCode() {
    if (!reservedCode) return;
    try {
      await navigator.clipboard.writeText(reservedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard bloqueado */ }
  }

  // Persiste o rascunho enquanto edita (não some ao fechar sem salvar).
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, priority, type, version, requestedBy }));
    } catch { /* storage bloqueado */ }
  }, [title, priority, type, version, requestedBy]);

  const hasContent = !!(title.trim() || priority || type || version.trim() || requestedBy);

  function clearDraft() {
    setTitle(""); setPriority(""); setType(""); setVersion(""); setRequestedBy("");
    setColumnId(initialColumnId);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage bloqueado */ }
    setConfirmClear(false);
  }

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/cards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columnId, title,
        code: reservedCode || undefined,
        priority: priority || undefined,
        type: type || undefined,
        version: version.trim() || undefined,
        requestedBy: requestedBy || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Falha ao criar card"); return; }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage bloqueado */ }
    onCreated(); onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo card</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          {reservedCode && (
            <Field>
              <FieldLabel>Chave</FieldLabel>
              <div className="flex items-center gap-2">
                <Input value={reservedCode} readOnly className="font-mono" />
                <Button
                  type="button" variant="outline" size="icon"
                  onClick={copyCode} aria-label="Copiar chave"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="card-title">Título</FieldLabel>
            <Input
              id="card-title" autoFocus placeholder="Ex.: Corrigir bug do login"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </Field>

          <Field>
            <FieldLabel>Coluna</FieldLabel>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Prioridade</FieldLabel>
            <Select value={priority || "none"} onValueChange={(v) => setPriority(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">Sem prioridade</SelectItem>
                  <SelectItem value="CRITICA">Crítica</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Tipo</FieldLabel>
            <Select value={type || "none"} onValueChange={(v) => setType(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">Sem tipo</SelectItem>
                  <SelectItem value="BUG">Bug</SelectItem>
                  <SelectItem value="FEATURE">Feature</SelectItem>
                  <SelectItem value="TAREFA">Tarefa</SelectItem>
                  <SelectItem value="SUBTASK">Subtask</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="card-version">Versão</FieldLabel>
            <Input
              id="card-version" placeholder="Ex.: 2.3.1"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </Field>

          <Field>
            <FieldLabel>Solicitado por</FieldLabel>
            <Select value={requestedBy || "none"} onValueChange={(v) => setRequestedBy(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Quem solicitou…" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">Ninguém</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            disabled={!hasContent}
            onClick={() => setConfirmClear(true)}
          >
            Limpar
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Criando…" : "Criar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <Dialog open={confirmClear} onOpenChange={(o) => { if (!o) setConfirmClear(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar informações?</DialogTitle>
            <DialogDescription>
              O rascunho deste card (título, prioridade, tipo e versão) será apagado. Não pode ser desfeito.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={clearDraft}>Limpar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
