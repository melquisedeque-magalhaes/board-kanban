"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface BoardLite { id: string; name: string; description: string | null }

// O primeiro da lista é o principal e mora em `/`; os outros em /b/<id>.
export function boardHref(boards: BoardLite[], id: string): string {
  return boards[0]?.id === id ? "/" : `/b/${id}`;
}

const BASIC = "basic";

export function BoardSwitcher({ board, boards }: { board: BoardLite; boards: BoardLite[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium hover:bg-muted">
            {board.name} <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Boards</div>
          <div className="flex max-h-72 flex-col overflow-y-auto">
            {boards.map((b) => (
              <button
                key={b.id} type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => { setOpen(false); if (b.id !== board.id) router.push(boardHref(boards, b.id)); }}
              >
                <span className="flex-1 truncate">{b.name}</span>
                {b.id === board.id && <Check className="size-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
          <div className="mt-1 border-t pt-1">
            <Button
              variant="ghost" size="sm" className="w-full justify-start"
              onClick={() => { setOpen(false); setCreating(true); }}
            >
              <Plus data-icon="inline-start" /> Novo board
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {creating && (
        <NewBoardDialog
          current={board}
          boards={boards}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            toast.success(`Board "${created.name}" criado`);
            router.push(`/b/${created.id}`);
          }}
        />
      )}
    </>
  );
}

function NewBoardDialog({ current, boards, onClose, onCreated }: {
  current: BoardLite;
  boards: BoardLite[];
  onClose: () => void;
  onCreated: (board: BoardLite) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Origem das colunas: "basic" ou o id do board a copiar.
  const [source, setSource] = useState<string>(BASIC);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/boards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        copyColumnsFrom: source === BASIC ? undefined : source,
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error((await res.text()) || "Falha ao criar board"); return; }
    onCreated(await res.json());
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo board</DialogTitle>
          <DialogDescription>
            Um board separado para uma situação específica. As colunas podem ser ajustadas depois.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="board-name">Nome</FieldLabel>
            <Input
              id="board-name" autoFocus placeholder="Ex.: Incidente de pagamentos"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="board-description">Descrição</FieldLabel>
            <Textarea
              id="board-description" rows={2} placeholder="Para que serve este board (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel>Colunas</FieldLabel>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={BASIC}>Básicas: A Fazer, Em Andamento, Concluído</SelectItem>
                  <SelectItem value={current.id}>Copiar de “{current.name}”</SelectItem>
                  {boards.filter((b) => b.id !== current.id).map((b) => (
                    <SelectItem key={b.id} value={b.id}>Copiar de “{b.name}”</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim() || saving}>
            {saving ? "Criando…" : "Criar board"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
