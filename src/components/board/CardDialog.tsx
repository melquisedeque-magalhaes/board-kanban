"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { ColumnData } from "./Column";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function CardDialog({ columns, initialColumnId, onClose, onCreated }: {
  columns: ColumnData[];
  initialColumnId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [columnId, setColumnId] = useState(initialColumnId);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");
  const [version, setVersion] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/cards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columnId, title,
        priority: priority || undefined,
        type: type || undefined,
        version: version.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Falha ao criar card"); return; }
    onCreated(); onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo card</DialogTitle>
        </DialogHeader>

        <FieldGroup>
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
        </FieldGroup>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Criando…" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
