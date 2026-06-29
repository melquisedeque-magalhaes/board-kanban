"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Hash, Flag, CalendarDays, CircleDot, Users as UsersIcon, Check, Plus,
  FileText, Paperclip, Eye, Pencil, Loader2, X,
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

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author?: { id: string; name: string; avatarUrl?: string | null } | null;
}
interface Attachment {
  id: string;
  url: string;
  name: string;
  contentType?: string | null;
  size?: number | null;
}
interface CardDetail {
  id: string;
  columnId: string;
  code: string | null;
  title: string;
  details: string | null;
  priority: "ALTA" | "MEDIA" | "BAIXA" | null;
  dueDate: string | null;
  assignees: { id: string; name: string; avatarUrl?: string | null }[];
  comments: Comment[];
  attachments: Attachment[];
}

const isImage = (a: Attachment) =>
  a.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(a.name);

const PR_OPTS = [
  { v: "none", label: "Vazio" },
  { v: "ALTA", label: "Alta" },
  { v: "MEDIA", label: "Média" },
  { v: "BAIXA", label: "Baixa" },
];

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex w-28 shrink-0 items-center gap-2 py-2 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Campo inline estilo Notion: transparente, hover, placeholder alinhado.
const inlineField =
  "w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground hover:bg-accent focus:bg-accent focus:ring-0";

// Render de markdown (descrição rica) com estilos leves p/ dark/light.
function MarkdownView({ source }: { source: string }) {
  return (
    <div className="max-w-none break-words text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...p }) => <a {...p} target="_blank" rel="noreferrer" />,
        }}
      >
        {source}
      </ReactMarkdown>
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
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [uploading, setUploading] = useState(false);
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: card = null, isLoading: loading } = useQuery({
    queryKey: ["card", cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<CardDetail | null> => {
      const r = await fetch(`/api/cards/${cardId}`);
      return r.ok ? r.json() : null;
    },
  });

  async function patch(data: Record<string, unknown>) {
    if (!cardId) return;
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("Falha ao salvar"); return; }
    qc.setQueryData(["card", cardId], await res.json());
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
    qc.setQueryData(["card", cardId], await res.json());
    onChanged();
  }

  // Sobe arquivo pro Blob, registra anexo e devolve. Refaz o fetch do card.
  async function uploadFile(file: File): Promise<Attachment | null> {
    if (!cardId) return null;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/cards/${cardId}/attachments`, { method: "POST", body: fd });
      if (!res.ok) {
        const msg = res.status === 503 ? "Configure o Vercel Blob (BLOB_READ_WRITE_TOKEN)" : "Falha no upload";
        toast.error(msg);
        return null;
      }
      const att: Attachment = await res.json();
      await qc.invalidateQueries({ queryKey: ["card", cardId] });
      onChanged();
      return att;
    } finally {
      setUploading(false);
    }
  }

  // Insere markdown no cursor do textarea de descrição (ou no fim).
  function insertIntoDetails(snippet: string) {
    const el = detailsRef.current;
    const current = card?.details ?? "";
    if (!el) { patch({ details: (current ? current + "\n" : "") + snippet }); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + snippet + el.value.slice(end);
    el.value = next;
    el.focus();
    const pos = start + snippet.length;
    el.setSelectionRange(pos, pos);
  }

  // Faz upload e insere a imagem como markdown (ou link, se não for imagem).
  async function uploadAndInsert(file: File) {
    const att = await uploadFile(file);
    if (!att) return;
    const md = isImage(att) ? `![${att.name}](${att.url})` : `[${att.name}](${att.url})`;
    insertIntoDetails(md + "\n");
  }

  async function deleteAttachment(attId: string) {
    if (!cardId) return;
    const res = await fetch(`/api/cards/${cardId}/attachments/${attId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Falha ao remover anexo"); return; }
    await qc.invalidateQueries({ queryKey: ["card", cardId] });
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
  const desc = card?.details ?? "";
  const hasDesc = desc.trim().length > 0;

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
            <SheetHeader className="px-8 pb-3 pt-8">
              <SheetTitle asChild>
                <textarea
                  defaultValue={card.title}
                  onBlur={(e) => { if (e.target.value !== card.title) patch({ title: e.target.value }); }}
                  rows={1}
                  className="w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-snug outline-none [field-sizing:content] focus:ring-0"
                />
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-1 px-8 py-2">
              <Row icon={Hash} label="Chave">
                <input
                  defaultValue={card.code ?? ""}
                  placeholder="Ex.: TI-42"
                  onBlur={(e) => { if ((e.target.value || null) !== card.code) patch({ code: e.target.value || null }); }}
                  className={inlineField}
                />
              </Row>

              <Row icon={Flag} label="Prioridade">
                <Select
                  value={card.priority ?? "none"}
                  onValueChange={(v) => patch({ priority: v === "none" ? null : v })}
                >
                  <SelectTrigger size="sm" className="w-40 border-0 bg-transparent shadow-none hover:bg-accent"><SelectValue /></SelectTrigger>
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
                    <button className={inlineField + " flex flex-wrap items-center gap-1.5 text-left"}>
                      {card.assignees.length === 0 ? (
                        <span className="text-muted-foreground">Adicionar responsável…</span>
                      ) : (
                        <>
                          {card.assignees.map((a) => (
                            <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2">
                              <Avatar className="size-5">
                                {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt={a.name} /> : null}
                                <AvatarFallback className="text-[9px] text-white" style={{ background: avatarColor(a.name) }}>
                                  {initials(a.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs">{a.name}</span>
                            </span>
                          ))}
                          <Plus className="size-3.5 text-muted-foreground" />
                        </>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-60 p-1">
                    <div className="px-2 py-1 text-xs text-muted-foreground">Selecione um ou mais</div>
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
                  <SelectTrigger size="sm" className="w-52 border-0 bg-transparent shadow-none hover:bg-accent">
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
                <input
                  type="date"
                  defaultValue={due}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                  className={inlineField + " w-44"}
                />
              </Row>
            </div>

            <Separator />

            {/* Descrição rica (markdown + imagens + anexos) */}
            <div className="flex flex-col gap-2 px-8 py-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4" /> Descrição
                </span>
                <div className="flex items-center gap-1">
                  {uploading && <Loader2 className="mr-1 size-4 animate-spin text-muted-foreground" />}
                  <Button
                    variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-3.5" /> Anexar
                  </Button>
                  {hasDesc ? (
                    <Button
                      variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
                      onClick={() => setEditingDetails((v) => !v)}
                    >
                      {editingDetails ? <><Eye className="size-3.5" /> Visualizar</> : <><Pencil className="size-3.5" /> Editar</>}
                    </Button>
                  ) : null}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAndInsert(f);
                  e.target.value = "";
                }}
              />

              {editingDetails || !hasDesc ? (
                <textarea
                  ref={detailsRef}
                  defaultValue={desc}
                  placeholder="Descreva a task em markdown. Cole ou arraste imagens para anexar…"
                  rows={6}
                  onBlur={(e) => { if ((e.target.value || null) !== card.details) patch({ details: e.target.value || null }); }}
                  onPaste={(e) => {
                    const file = Array.from(e.clipboardData.files)[0];
                    if (file) { e.preventDefault(); uploadAndInsert(file); }
                  }}
                  onDrop={(e) => {
                    const file = e.dataTransfer.files?.[0];
                    if (file) { e.preventDefault(); uploadAndInsert(file); }
                  }}
                  className="min-h-32 w-full resize-y rounded-md bg-muted/40 p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring [field-sizing:content]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDetails(true)}
                  className="cursor-text rounded-md p-3 text-left hover:bg-accent/50"
                >
                  <MarkdownView source={desc} />
                </button>
              )}

              {/* Anexos */}
              {card.attachments.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Anexos</span>
                  <div className="flex flex-wrap gap-2">
                    {card.attachments.map((a) => (
                      <div key={a.id} className="group relative">
                        {isImage(a) ? (
                          <a href={a.url} target="_blank" rel="noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.url} alt={a.name} className="h-20 w-20 rounded-md border object-cover" />
                          </a>
                        ) : (
                          <a
                            href={a.url} target="_blank" rel="noreferrer"
                            className="flex h-20 w-32 flex-col justify-center gap-1 rounded-md border bg-muted/40 p-2 text-xs hover:bg-accent"
                          >
                            <Paperclip className="size-4 text-muted-foreground" />
                            <span className="truncate">{a.name}</span>
                          </a>
                        )}
                        <button
                          onClick={() => deleteAttachment(a.id)}
                          className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-destructive p-0.5 text-white group-hover:block"
                          aria-label="Remover anexo"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
