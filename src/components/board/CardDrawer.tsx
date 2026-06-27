"use client";
import { useEffect, useState } from "react";
import {
  AlignLeft, Hash, Flag, CalendarDays, CircleDot, Users as UsersIcon, Check,
} from "lucide-react";
import { toast } from "sonner";
import type { ColumnData } from "./Column";
import type { UserLite } from "./Chrome";
import { avatarColor, initials, columnSwatch } from "./colors";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author?: { id: string; name: string; avatarUrl?: string | null } | null;
}
interface CardDetail {
  id: string;
  columnId: string;
  code: string | null;
  title: string;
  description: string | null;
  priority: "ALTA" | "MEDIA" | "BAIXA" | null;
  dueDate: string | null;
  assignees: { id: string; name: string; avatarUrl?: string | null }[];
  comments: Comment[];
}

const PR_OPTS = [
  { v: "none", label: "Vazio" },
  { v: "ALTA", label: "Alta" },
  { v: "MEDIA", label: "Média" },
  { v: "BAIXA", label: "Baixa" },
];

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <div className="flex w-32 shrink-0 items-center gap-2 pt-1.5 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CardDrawer({ cardId, columns, users, onClose, onChanged }: {
  cardId: string | null;
  columns: ColumnData[];
  users: UserLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId) { setCard(null); return; }
    setLoading(true);
    fetch(`/api/cards/${cardId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setCard(c))
      .finally(() => setLoading(false));
  }, [cardId]);

  async function patch(data: Record<string, unknown>) {
    if (!cardId) return;
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Falha ao salvar"); return; }
    setCard(await res.json());
    onChanged();
  }

  async function addComment() {
    if (!cardId || !comment.trim()) return;
    const res = await fetch(`/api/cards/${cardId}/comments`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    if (!res.ok) { toast.error("Falha ao comentar"); return; }
    setComment("");
    setCard(await res.json());
    onChanged();
  }

  function toggleAssignee(userId: string) {
    if (!card) return;
    const has = card.assignees.some((a) => a.id === userId);
    const next = has
      ? card.assignees.filter((a) => a.id !== userId).map((a) => a.id)
      : [...card.assignees.map((a) => a.id), userId];
    patch({ assignees: next });
  }

  const open = !!cardId;
  const due = card?.dueDate ? card.dueDate.slice(0, 10) : "";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {!card ? (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>{loading ? "Carregando…" : "Card"}</SheetTitle>
            </SheetHeader>
          </div>
        ) : (
          <>
            <SheetHeader className="px-8 pb-2 pt-8">
              <SheetTitle asChild>
                <textarea
                  defaultValue={card.title}
                  onBlur={(e) => { if (e.target.value !== card.title) patch({ title: e.target.value }); }}
                  rows={1}
                  className="w-full resize-none border-0 bg-transparent p-0 text-2xl font-bold leading-tight outline-none focus:ring-0"
                />
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-0.5 px-8 py-2">
              <Row icon={AlignLeft} label="Notas">
                <Textarea
                  defaultValue={card.description ?? ""}
                  placeholder="Vazio"
                  onBlur={(e) => { if ((e.target.value || null) !== card.description) patch({ description: e.target.value || null }); }}
                  className="min-h-9 resize-y border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </Row>

              <Row icon={Hash} label="Chave">
                <Input
                  defaultValue={card.code ?? ""}
                  placeholder="Vazio"
                  onBlur={(e) => { if ((e.target.value || null) !== card.code) patch({ code: e.target.value || null }); }}
                  className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </Row>

              <Row icon={Flag} label="Prioridade">
                <Select
                  value={card.priority ?? "none"}
                  onValueChange={(v) => patch({ priority: v === "none" ? null : v })}
                >
                  <SelectTrigger size="sm" className="w-40 border-0 bg-transparent shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {PR_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Row>

              <Row icon={UsersIcon} label="Responsável">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 px-2 font-normal">
                      {card.assignees.length === 0 ? (
                        <span className="text-muted-foreground">Vazio</span>
                      ) : (
                        card.assignees.map((a) => (
                          <span key={a.id} className="flex items-center gap-1.5">
                            <Avatar className="size-5">
                              {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt={a.name} /> : null}
                              <AvatarFallback className="text-[9px] text-white" style={{ background: avatarColor(a.name) }}>
                                {initials(a.name)}
                              </AvatarFallback>
                            </Avatar>
                            {a.name}
                          </span>
                        ))
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    {users.map((u) => {
                      const sel = card.assignees.some((a) => a.id === u.id);
                      return (
                        <button key={u.id}
                          onClick={() => toggleAssignee(u.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                          <Avatar className="size-5">
                            {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
                            <AvatarFallback className="text-[9px] text-white" style={{ background: avatarColor(u.name) }}>
                              {initials(u.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex-1 truncate text-left">{u.name}</span>
                          {sel && <Check className="size-4" />}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </Row>

              <Row icon={CircleDot} label="Status">
                <Select value={card.columnId} onValueChange={(v) => patch({ columnId: v })}>
                  <SelectTrigger size="sm" className="w-52 border-0 bg-transparent shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {columns.map((c) => {
                        const sw = columnSwatch(c.name);
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            <Badge className="border-transparent font-medium" style={{ background: sw.bg, color: sw.text }}>
                              {c.name}
                            </Badge>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Row>

              <Row icon={CalendarDays} label="Prazo">
                <Input
                  type="date"
                  defaultValue={due}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                  className="h-8 w-44 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </Row>
            </div>

            <Separator />

            <div className="flex flex-col gap-3 px-8 py-5">
              <span className="text-sm font-semibold">Comentários</span>
              <ScrollArea className="max-h-60">
                <div className="flex flex-col gap-3 pr-3">
                  {card.comments.length === 0 && (
                    <span className="text-sm text-muted-foreground">Nenhum comentário ainda.</span>
                  )}
                  {card.comments.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <Avatar className="size-6">
                        {c.author?.avatarUrl ? <AvatarImage src={c.author.avatarUrl} alt={c.author.name} /> : null}
                        <AvatarFallback className="text-[9px] text-white" style={{ background: avatarColor(c.author?.name ?? "?") }}>
                          {initials(c.author?.name ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">{c.author?.name ?? "Alguém"}</span>
                        <span className="text-sm">{c.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex items-center gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addComment(); }}
                  placeholder="Adicionar um comentário…"
                  className="h-9"
                />
                <Button size="sm" onClick={addComment} disabled={!comment.trim()}>Enviar</Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
