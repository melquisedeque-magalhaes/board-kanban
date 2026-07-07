"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Hash, Flag, CalendarDays, CircleDot, Users as UsersIcon, Check, Plus,
  FileText, Paperclip, Eye, Pencil, Loader2, X, Archive, Tag, GitBranch, Clock,
  Package, UserPlus, ExternalLink, Ban, TriangleAlert, ListTree, CornerLeftUp,
} from "lucide-react";
import { toast } from "sonner";
import type { ColumnData } from "./Column";
import type { UserLite } from "./Chrome";
import { avatarColor, initials, columnSwatch, CARD_TYPE, BLOCKER } from "./colors";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

interface Attachment {
  id: string;
  url: string;
  name: string;
  contentType?: string | null;
  size?: number | null;
}
interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author?: { id: string; name: string; avatarUrl?: string | null } | null;
  attachments: Attachment[];
}
interface CardDetail {
  id: string;
  columnId: string;
  code: string | null;
  title: string;
  details: string | null;
  priority: "CRITICA" | "ALTA" | "MEDIA" | "BAIXA" | null;
  type: "BUG" | "FEATURE" | "TAREFA" | "SUBTASK" | null;
  blocker: "IMPEDIMENTO" | "AVISO" | null;
  blockerReason: string | null;
  parent: { id: string; code: string | null; title: string } | null;
  children: { id: string; code: string | null; title: string; type: string | null; column: { name: string } }[];
  version: string | null;
  branchUrl: string | null;
  dueDate: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string; avatarUrl?: string | null } | null;
  assignees: { id: string; name: string; avatarUrl?: string | null }[];
  comments: Comment[];
  attachments: Attachment[];
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

const isImage = (a: Attachment) =>
  a.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(a.name);

const PR_OPTS = [
  { v: "none", label: "Vazio" },
  { v: "CRITICA", label: "Crítica" },
  { v: "ALTA", label: "Alta" },
  { v: "MEDIA", label: "Média" },
  { v: "BAIXA", label: "Baixa" },
];

const TYPE_OPTS = [
  { v: "none", label: "Vazio" },
  { v: "BUG", label: "Bug" },
  { v: "FEATURE", label: "Feature" },
  { v: "TAREFA", label: "Tarefa" },
  { v: "SUBTASK", label: "Subtask" },
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

export function CardDrawer({ cardId, columns, users, currentUser, onClose, onChanged, onArchive, onOpen }: {
  cardId: string | null;
  columns: ColumnData[];
  users: UserLite[];
  currentUser?: { id: string; name: string; avatarUrl: string | null } | null;
  onClose: () => void;
  onChanged: () => void;
  onArchive?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([]);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subType, setSubType] = useState<"SUBTASK" | "BUG">("SUBTASK");
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);

  // Largura do drawer (px), ajustável arrastando a borda esquerda; persiste no localStorage.
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 640;
    const v = Number(localStorage.getItem("cardDrawerWidth"));
    return v >= 380 ? v : 640;
  });
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    let last = width;
    const onMove = (ev: PointerEvent) => {
      // Painel ancorado à direita → largura = distância do cursor até a borda direita.
      last = Math.min(Math.max(window.innerWidth - ev.clientX, 380), window.innerWidth - 80);
      setWidth(last);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try { localStorage.setItem("cardDrawerWidth", String(Math.round(last))); } catch { /* storage bloqueado */ }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Troca de card → zera rascunho do comentário e anexos pendentes (reset em render).
  const [prevCardId, setPrevCardId] = useState(cardId);
  if (cardId !== prevCardId) {
    setPrevCardId(cardId);
    setComment("");
    setPendingAtts([]);
    setEditingCommentId(null);
    setAddingSub(false);
    setSubTitle("");
    setSubType("SUBTASK");
  }

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
    if (!cardId || (!comment.trim() && pendingAtts.length === 0)) return;
    const res = await fetch(`/api/cards/${cardId}/comments`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: comment, attachmentIds: pendingAtts.map((a) => a.id) }),
    });
    if (!res.ok) { toast.error("Falha ao comentar"); return; }
    setComment("");
    setPendingAtts([]);
    qc.setQueryData(["card", cardId], await res.json());
    onChanged();
  }

  function startEditComment(c: Comment) {
    setEditingCommentId(c.id);
    setEditingBody(c.body);
  }

  async function saveEditComment() {
    if (!cardId || !editingCommentId || !editingBody.trim()) return;
    const res = await fetch(`/api/cards/${cardId}/comments/${editingCommentId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: editingBody }),
    });
    if (!res.ok) { toast.error("Falha ao editar comentário"); return; }
    setEditingCommentId(null);
    qc.setQueryData(["card", cardId], await res.json());
    onChanged();
  }

  // Sobe arquivo pro Blob e registra o anexo (nível card). Sem refetch.
  async function postAttachment(file: File): Promise<Attachment | null> {
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
      return (await res.json()) as Attachment;
    } finally {
      setUploading(false);
    }
  }

  // Upload p/ a descrição: registra e refaz o fetch do card.
  async function uploadFile(file: File): Promise<Attachment | null> {
    const att = await postAttachment(file);
    if (!att) return null;
    await qc.invalidateQueries({ queryKey: ["card", cardId] });
    onChanged();
    return att;
  }

  // Upload de print no comentário: fica pendente até enviar (vincula no envio).
  async function attachToComment(file: File) {
    const att = await postAttachment(file);
    if (att) setPendingAtts((prev) => [...prev, att]);
  }

  // Remove um anexo pendente (ainda sem comentário) do Blob + DB.
  async function removePending(attId: string) {
    if (!cardId) return;
    setPendingAtts((prev) => prev.filter((a) => a.id !== attId));
    await fetch(`/api/cards/${cardId}/attachments/${attId}`, { method: "DELETE" });
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

  async function createSubtask() {
    if (!cardId || !subTitle.trim()) return;
    const firstCol = columns[0]?.id;
    const res = await fetch("/api/cards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId: firstCol, title: subTitle, type: subType, parentId: cardId }),
    });
    if (!res.ok) { toast.error("Falha ao criar subtarefa"); return; }
    setSubTitle(""); setAddingSub(false);
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
  const bl = card?.blocker ? BLOCKER[card.blocker] : null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        className="gap-0 overflow-y-auto p-0"
        style={{ width: `${width}px`, maxWidth: "calc(100vw - 80px)" }}
      >
        {/* Handle de redimensionar — arrasta a borda esquerda do drawer. */}
        <div
          onPointerDown={startResize}
          className="absolute left-0 top-0 z-50 h-full w-1.5 cursor-ew-resize hover:bg-primary/30"
          aria-hidden
        />
        {!card ? (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>{loading ? "Carregando…" : "Card"}</SheetTitle>
            </SheetHeader>
          </div>
        ) : (
          <>
            <SheetHeader className="px-8 pb-3 pt-8">
              {bl ? (
                <Badge
                  variant="secondary"
                  className="w-fit gap-1 border-transparent font-medium"
                  style={{ background: bl.bg, color: bl.text }}
                >
                  {card.blocker === "IMPEDIMENTO" ? <Ban className="size-3" /> : <TriangleAlert className="size-3" />}
                  {bl.label}
                </Badge>
              ) : null}
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

              {card.parent ? (
                <Row icon={CornerLeftUp} label="Card pai">
                  <button
                    onClick={() => onOpen?.(card.parent!.id)}
                    className={inlineField + " flex items-center gap-1.5 text-left"}
                  >
                    <span className="truncate">
                      {card.parent.code ? `${card.parent.code} · ` : ""}{card.parent.title}
                    </span>
                  </button>
                </Row>
              ) : null}

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

              <Row icon={Tag} label="Tipo">
                <Select
                  value={card.type ?? "none"}
                  onValueChange={(v) => patch({ type: v === "none" ? null : v })}
                >
                  <SelectTrigger size="sm" className="w-40 border-0 bg-transparent shadow-none hover:bg-accent"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TYPE_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Row>

              <Row icon={Package} label="Versão">
                <input
                  defaultValue={card.version ?? ""}
                  placeholder="Ex.: 2.3.1"
                  onBlur={(e) => { if ((e.target.value || null) !== card.version) patch({ version: e.target.value || null }); }}
                  className={inlineField}
                />
              </Row>

              <Row icon={GitBranch} label="Branch">
                <div className="flex items-center gap-1">
                  <input
                    defaultValue={card.branchUrl ?? ""}
                    placeholder="Cole o link da branch/MR…"
                    onBlur={(e) => { if ((e.target.value || null) !== card.branchUrl) patch({ branchUrl: e.target.value || null }); }}
                    className={inlineField}
                  />
                  {card.branchUrl && (
                    <a
                      href={card.branchUrl} target="_blank" rel="noreferrer"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Abrir branch"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
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

              <Row icon={UserPlus} label="Solicitado por">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={inlineField + " flex items-center gap-1.5 text-left"}>
                      {card.requestedBy ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2">
                          <Avatar className="size-5">
                            {card.requestedBy.avatarUrl ? <AvatarImage src={card.requestedBy.avatarUrl} alt={card.requestedBy.name} /> : null}
                            <AvatarFallback className="text-[9px] text-white" style={{ background: avatarColor(card.requestedBy.name) }}>
                              {initials(card.requestedBy.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{card.requestedBy.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Quem solicitou…</span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-60 p-1">
                    <button
                      onClick={() => patch({ requestedBy: null })}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent">
                      <X className="size-4" /> <span className="flex-1 text-left">Ninguém</span>
                      {!card.requestedBy && <Check className="size-4" />}
                    </button>
                    {users.map((u) => (
                      <button key={u.id}
                        onClick={() => patch({ requestedBy: u.id })}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                        <Avatar className="size-5">
                          {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
                          <AvatarFallback className="text-[9px] text-white" style={{ background: avatarColor(u.name) }}>
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 truncate text-left">{u.name}</span>
                        {card.requestedBy?.id === u.id && <Check className="size-4" />}
                      </button>
                    ))}
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

              <Row icon={Ban} label="Bloqueio">
                <div className="flex flex-col gap-2">
                  <Select
                    value={card.blocker ?? "none"}
                    onValueChange={(v) => patch({ blocker: v === "none" ? null : v, ...(v === "none" ? { blockerReason: null } : {}) })}
                  >
                    <SelectTrigger size="sm" className="w-44 border-0 bg-transparent shadow-none hover:bg-accent"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">Sem bloqueio</SelectItem>
                        <SelectItem value="IMPEDIMENTO">🚫 Impedimento</SelectItem>
                        <SelectItem value="AVISO">⚠️ Aviso</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {card.blocker ? (
                    <textarea
                      defaultValue={card.blockerReason ?? ""}
                      placeholder="Motivo do bloqueio…"
                      rows={2}
                      onBlur={(e) => { if ((e.target.value || null) !== card.blockerReason) patch({ blockerReason: e.target.value || null }); }}
                      className="w-full resize-y rounded-md bg-muted/40 p-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                    />
                  ) : null}
                </div>
              </Row>

              <Row icon={Clock} label="Criado em">
                <div className="px-2 py-2 text-sm text-muted-foreground">{fmtDateTime(card.createdAt)}</div>
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
                  className="min-h-32 w-full resize-y rounded-lg bg-muted/40 p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring [field-sizing:content]"
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

            <div className="flex flex-col gap-2 px-8 py-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ListTree className="size-4" /> Subtarefas
                  {card.children.length > 0 ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {card.children.filter((k) => /(done|conclu)/i.test(k.column.name)).length}/{card.children.length}
                    </span>
                  ) : null}
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setAddingSub((v) => !v)}>
                  <Plus className="size-3.5" /> Adicionar
                </Button>
              </div>

              {card.children.map((k) => {
                const kty = k.type ? CARD_TYPE[k.type] : null;
                return (
                  <button
                    key={k.id}
                    onClick={() => onOpen?.(k.id)}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm hover:border-foreground/20"
                  >
                    {kty ? (
                      <Badge variant="secondary" className="border-transparent font-medium" style={{ background: kty.bg, color: kty.text }}>
                        {kty.label}
                      </Badge>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {k.code ? <span className="text-muted-foreground">{k.code} · </span> : null}{k.title}
                    </span>
                    <Badge variant="secondary" className="border-transparent" style={{ background: columnSwatch(k.column.name).bg, color: columnSwatch(k.column.name).text }}>
                      {k.column.name}
                    </Badge>
                  </button>
                );
              })}

              {addingSub ? (
                <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
                  <div className="flex gap-1">
                    <Button variant={subType === "SUBTASK" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setSubType("SUBTASK")}>Subtask</Button>
                    <Button variant={subType === "BUG" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setSubType("BUG")}>Bug</Button>
                  </div>
                  <input
                    autoFocus
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createSubtask(); if (e.key === "Escape") setAddingSub(false); }}
                    placeholder="Título da subtarefa…"
                    className="w-full rounded-md bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setAddingSub(false); setSubTitle(""); }}>Cancelar</Button>
                    <Button size="sm" onClick={createSubtask} disabled={!subTitle.trim()}>Criar</Button>
                  </div>
                </div>
              ) : card.children.length === 0 ? (
                <span className="text-sm text-muted-foreground">Nenhuma subtarefa.</span>
              ) : null}
            </div>

            <Separator />

            <div className="flex flex-col gap-3 px-8 py-5">
              <span className="text-sm font-semibold">Comentários</span>
              <div className="flex flex-col gap-3">
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
                      <div className="group/comment flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{c.author?.name ?? "Alguém"}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtDateTime(c.createdAt)}</span>
                          {c.author?.id && currentUser?.id === c.author.id && editingCommentId !== c.id && (
                            <button
                              onClick={() => startEditComment(c)}
                              className="ml-auto hidden rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground group-hover/comment:block"
                              aria-label="Editar comentário"
                            >
                              <Pencil className="size-3" />
                            </button>
                          )}
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editingBody}
                              autoFocus
                              onChange={(e) => setEditingBody(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEditComment(); }
                                if (e.key === "Escape") setEditingCommentId(null);
                              }}
                              rows={3}
                              className="block min-h-[72px] w-full resize-y rounded-lg bg-muted/40 p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                            />
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setEditingCommentId(null)}>Cancelar</Button>
                              <Button size="sm" onClick={saveEditComment} disabled={!editingBody.trim()}>Salvar</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {c.body ? <MarkdownView source={c.body} /> : null}
                            {c.attachments?.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-2">
                                {c.attachments.map((a) =>
                                  isImage(a) ? (
                                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={a.url} alt={a.name} className="max-h-40 rounded-md border object-cover" />
                                    </a>
                                  ) : (
                                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                                      className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs hover:bg-accent">
                                      <Paperclip className="size-3.5" /> <span className="truncate">{a.name}</span>
                                    </a>
                                  ),
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {pendingAtts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAtts.map((a) => (
                    <div key={a.id} className="group relative">
                      {isImage(a) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt={a.name} className="h-16 w-16 rounded-md border object-cover" />
                      ) : (
                        <div className="flex h-16 w-24 flex-col justify-center gap-1 rounded-md border bg-muted/40 p-2 text-xs">
                          <Paperclip className="size-4 text-muted-foreground" />
                          <span className="truncate">{a.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => removePending(a.id)}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-white"
                        aria-label="Remover anexo"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Caixa de comentário: multi-linha + barra com anexo + ações. */}
              <div className="rounded-lg bg-muted/40 focus-within:ring-1 focus-within:ring-ring">
                <input
                  ref={commentFileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attachToComment(f);
                    e.target.value = "";
                  }}
                />
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter quebra linha; Ctrl/⌘+Enter envia.
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment(); }
                  }}
                  onPaste={(e) => {
                    const file = Array.from(e.clipboardData.files)[0];
                    if (file) { e.preventDefault(); attachToComment(file); }
                  }}
                  placeholder="Escreva um comentário…"
                  rows={3}
                  className="block min-h-[84px] w-full resize-y bg-transparent p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-between border-t border-foreground/10 px-2 py-1.5">
                  <Button
                    variant="ghost" size="icon" className="size-8"
                    onClick={() => commentFileRef.current?.click()}
                    disabled={uploading}
                    title="Anexar arquivo/imagem"
                    aria-label="Anexar arquivo/imagem ao comentário"
                  >
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setComment(""); setPendingAtts([]); }}
                      disabled={!comment && pendingAtts.length === 0}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={addComment}
                      disabled={!comment.trim() && pendingAtts.length === 0}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>

              {onArchive && (
                <>
                  <Separator className="my-1" />
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 gap-1.5 self-start px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { onArchive(card.id); onClose(); }}
                  >
                    <Archive className="size-3.5" /> Arquivar card
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
