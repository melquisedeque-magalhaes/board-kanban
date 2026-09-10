import { db } from "@/lib/db";
import { positionBetween } from "@/lib/positions";
import type {
  CardFilter, CreateCardInput, UpdateCardInput, Blocker,
} from "./types";
import { notifyBlockerChange, notifyCardMoved, notifyComment } from "./notifications";
import { dispatchCardCreated } from "./card-created-trigger";
import { dispatchCardMoved } from "./card-moved-trigger";

// Bloqueios que impedem o card de mudar de coluna (reorder na mesma coluna é livre).
const BLOCKING_MOVE: Blocker[] = ["IMPEDIMENTO", "AJUSTES"];
const BLOCKER_LABEL: Record<Blocker, string> = {
  IMPEDIMENTO: "Impedimento",
  AVISO: "Aviso",
  AJUSTES: "Ajustes a Fazer",
};

const cardInclude = {
  assignees: true,
  requestedBy: true,
  labels: true,
  parent: { select: { id: true, code: true, title: true } },
  children: { where: { archivedAt: null }, select: { id: true, column: { select: { name: true } } } },
  _count: { select: { comments: true } },
} as const;

export async function resolveColumnId(ref: { columnId?: string; columnName?: string }): Promise<string> {
  if (ref.columnId) {
    const c = await db.column.findUnique({ where: { id: ref.columnId } });
    if (c) return c.id;
  }
  if (ref.columnName) {
    const c = await db.column.findFirst({ where: { name: ref.columnName } });
    if (c) return c.id;
  }
  throw new Error(`Coluna não encontrada: ${ref.columnId ?? ref.columnName}`);
}

export async function resolveUserIds(refs: string[]): Promise<string[]> {
  if (!refs.length) return [];
  const users = await db.user.findMany({
    where: { OR: [{ id: { in: refs } }, { name: { in: refs } }, { email: { in: refs } }] },
  });
  return users.map((u) => u.id);
}

// Resolve um único ref (id/nome/e-mail) para um id, ou null se vazio/não achado.
async function resolveUserId(ref?: string | null): Promise<string | null> {
  if (!ref) return null;
  const [id] = await resolveUserIds([ref]);
  return id ?? null;
}

async function resolveLabelIds(refs: string[]): Promise<string[]> {
  if (!refs.length) return [];
  const labels = await db.label.findMany({
    where: { OR: [{ id: { in: refs } }, { name: { in: refs } }] },
  });
  return labels.map((l) => l.id);
}

const CARD_CODE_PREFIX = "TI-";

// Próxima Chave sequencial global (TI-1, TI-2, …) via contador atômico:
// um único UPDATE ... increment garante que dois creates simultâneos nunca
// recebam o mesmo número. O contador é seedado pela migration no maior N atual.
export async function nextCardCode(): Promise<string> {
  const { value } = await db.counter.update({
    where: { name: "card" },
    data: { value: { increment: 1 } },
    select: { value: true },
  });
  return `${CARD_CODE_PREFIX}${value}`;
}

// Prévia da próxima chave SEM consumir (read-only). O número real é gerado no
// create (nextCardCode, atômico); esta função só mostra a chave provável no
// dialog. Pode divergir por 1 se outro card for criado no meio — aceito, e sem
// os furos/corrida que a reserva-ao-abrir causava (ver spec TI-129).
export async function peekCardCode(): Promise<string> {
  const c = await db.counter.findUnique({
    where: { name: "card" },
    select: { value: true },
  });
  return `${CARD_CODE_PREFIX}${(c?.value ?? 0) + 1}`;
}

export async function listColumns() {
  return db.column.findMany({
    orderBy: { position: "asc" },
    include: {
      _count: { select: { subscriptions: true } },
      // Board não mostra cards arquivados.
      cards: { where: { archivedAt: null }, orderBy: { position: "asc" }, include: cardInclude },
    },
  });
}

export async function listCards(filter: CardFilter) {
  const columnId = filter.columnId ?? (filter.columnName
    ? (await db.column.findFirst({ where: { name: filter.columnName } }))?.id
    : undefined);
  return db.card.findMany({
    where: {
      archivedAt: null,
      ...(columnId ? { columnId } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.assignee
        ? { assignees: { some: { OR: [
            { id: filter.assignee }, { name: filter.assignee }, { email: filter.assignee },
          ] } } }
        : {}),
    },
    orderBy: [{ columnId: "asc" }, { position: "asc" }],
    include: cardInclude,
  });
}

// ── Projeção enxuta para agentes (MCP) ──
//
// `cardInclude` é a forma da UI: ela precisa de `details`, do objeto completo de
// cada responsável (para o avatar) e de quem solicitou. Servida por MCP a um
// agente, essa forma é inutilizável. Medido em 10/09/2026, com 578 cards:
//
//   list_columns({})  1.531.643 caracteres  (~383k tokens)
//   list_cards({})    1.424.036 caracteres  (~356k tokens)
//
// `details` sozinho pesa 495k caracteres, `assignees` 207k e `requestedBy` 142k.
// O SDK do Claude corta tool result em 25k tokens, grava o excedente em arquivo
// e o agente queima turnos de Read/Grep — uma pergunta de "quantas colunas
// existem" custou 8 tool calls. O harness codex não corta: manda o payload
// inteiro ao modelo e estoura a janela.
//
// A projeção abaixo mantém o que identifica, ordena e prioriza um card, e joga
// fora os blobs — quem precisa do corpo chama `get_card`. `listColumns` (UI) e
// `listCards` (API HTTP) seguem intactas.

export const MCP_LIST_DEFAULT_LIMIT = 50;
export const MCP_LIST_MAX_LIMIT = 200;

/** Limite pedido pelo agente, saturado na faixa [1, MCP_LIST_MAX_LIMIT]. */
export function clampMcpLimit(raw?: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return MCP_LIST_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n < 1) return MCP_LIST_DEFAULT_LIMIT;
  return Math.min(n, MCP_LIST_MAX_LIMIT);
}

// `select`, não `include`: assim details/documentation não saem nem do banco.
const cardSummarySelect = {
  id: true, code: true, title: true, columnId: true, priority: true, type: true,
  version: true, branchUrl: true, dueDate: true, position: true, parentId: true,
  blocker: true, blockerReason: true, bot: true, createdAt: true, updatedAt: true,
  assignees: { select: { name: true } },
  labels: { select: { name: true } },
  requestedBy: { select: { name: true } },
  _count: { select: { comments: true, children: true } },
} as const;

interface CardSummarySource {
  id: string;
  code?: string | null;
  title: string;
  columnId: string;
  priority?: unknown;
  type?: unknown;
  version?: string | null;
  branchUrl?: string | null;
  dueDate?: Date | string | null;
  position: number;
  parentId?: string | null;
  blocker?: unknown;
  blockerReason?: string | null;
  bot?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  assignees?: { name: string | null }[];
  labels?: { name: string | null }[];
  requestedBy?: { name: string | null } | null;
  _count?: { comments?: number; children?: number };
}

export interface CardSummary {
  id: string;
  code: string | null;
  title: string;
  columnId: string;
  priority: unknown;
  type: unknown;
  version: string | null;
  branchUrl: string | null;
  dueDate: Date | string | null;
  position: number;
  parentId: string | null;
  blocker: unknown;
  blockerReason: string | null;
  bot: boolean;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  /** Nomes, não objetos de usuário — o objeto completo respondia por 207k caracteres. */
  assignees: string[];
  labels: string[];
  requestedBy: string | null;
  comments: number;
  children: number;
}

const names = (rows?: { name: string | null }[]): string[] =>
  (rows ?? []).map((r) => r.name).filter((n): n is string => typeof n === "string");

export function toCardSummary(card: CardSummarySource): CardSummary {
  return {
    id: card.id,
    code: card.code ?? null,
    title: card.title,
    columnId: card.columnId,
    priority: card.priority ?? null,
    type: card.type ?? null,
    version: card.version ?? null,
    branchUrl: card.branchUrl ?? null,
    dueDate: card.dueDate ?? null,
    position: card.position,
    parentId: card.parentId ?? null,
    blocker: card.blocker ?? null,
    blockerReason: card.blockerReason ?? null,
    bot: card.bot ?? false,
    createdAt: card.createdAt ?? null,
    updatedAt: card.updatedAt ?? null,
    assignees: names(card.assignees),
    labels: names(card.labels),
    requestedBy: card.requestedBy?.name ?? null,
    comments: card._count?.comments ?? 0,
    children: card._count?.children ?? 0,
  };
}

/** `where` compartilhado entre listCards (UI/API) e listCardsSummary (MCP). */
async function cardFilterWhere(filter: CardFilter) {
  const columnId = filter.columnId ?? (filter.columnName
    ? (await db.column.findFirst({ where: { name: filter.columnName } }))?.id
    : undefined);
  return {
    archivedAt: null,
    ...(columnId ? { columnId } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.assignee
      ? { assignees: { some: { OR: [
          { id: filter.assignee }, { name: filter.assignee }, { email: filter.assignee },
        ] } } }
      : {}),
  };
}

export interface CardSummaryPage {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  cards: CardSummary[];
}

/**
 * Cards em forma enxuta e PAGINADA. O envelope carrega `total`/`hasMore` para o
 * agente saber que existe mais página em vez de concluir em cima de um pedaço.
 */
export async function listCardsSummary(
  filter: CardFilter,
  page?: { limit?: number; offset?: number },
): Promise<CardSummaryPage> {
  const where = await cardFilterWhere(filter);
  const limit = clampMcpLimit(page?.limit);
  const offset = Math.max(0, Math.floor(page?.offset ?? 0) || 0);
  const [total, rows] = await Promise.all([
    db.card.count({ where }),
    db.card.findMany({
      where,
      orderBy: [{ columnId: "asc" }, { position: "asc" }],
      select: cardSummarySelect,
      skip: offset,
      take: limit,
    }),
  ]);
  const cards = (rows as unknown as CardSummarySource[]).map(toCardSummary);
  return { total, offset, limit, hasMore: offset + cards.length < total, cards };
}

export interface ArchivedCardSummary extends CardSummary {
  /** Nome da coluna de origem — a UI do arquivo mostra de onde o card saiu. */
  column: string | null;
  archivedAt: Date | string | null;
}

export interface ArchivedCardSummaryPage {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  cards: ArchivedCardSummary[];
}

/**
 * Arquivo em forma enxuta e paginada. Na forma da UI eram 66 cards em 128.575
 * caracteres (~32k tokens), também acima do corte de tool result do SDK.
 */
export async function listArchivedCardsSummary(
  page?: { limit?: number; offset?: number },
): Promise<ArchivedCardSummaryPage> {
  const where = { archivedAt: { not: null } };
  const limit = clampMcpLimit(page?.limit);
  const offset = Math.max(0, Math.floor(page?.offset ?? 0) || 0);
  const [total, rows] = await Promise.all([
    db.card.count({ where }),
    db.card.findMany({
      where,
      orderBy: { archivedAt: "desc" },
      select: { ...cardSummarySelect, archivedAt: true, column: { select: { name: true } } },
      skip: offset,
      take: limit,
    }),
  ]);
  const cards = (rows as unknown as (CardSummarySource & {
    archivedAt?: Date | string | null;
    column?: { name: string | null } | null;
  })[]).map((row) => ({
    ...toCardSummary(row),
    column: row.column?.name ?? null,
    archivedAt: row.archivedAt ?? null,
  }));
  return { total, offset, limit, hasMore: offset + cards.length < total, cards };
}

export interface ColumnSummary {
  id: string;
  name: string;
  color: string | null;
  position: number;
  subscriptions: number;
  cardCount: number;
}

/**
 * Colunas com a CONTAGEM de cards, sem os cards. Era `listColumns` (a query da
 * UI, que embute todo card com `cardInclude`) que servia o `list_columns` do MCP
 * e produzia os 1,5 MB. Quem quer os cards chama `list_cards`.
 */
export async function listColumnsSummary(): Promise<ColumnSummary[]> {
  const cols = await db.column.findMany({
    orderBy: { position: "asc" },
    include: {
      _count: { select: { subscriptions: true, cards: { where: { archivedAt: null } } } },
    },
  });
  return (cols as unknown as {
    id: string; name: string; color: string | null; position: number;
    _count?: { subscriptions?: number; cards?: number };
  }[]).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    position: c.position,
    subscriptions: c._count?.subscriptions ?? 0,
    cardCount: c._count?.cards ?? 0,
  }));
}

// Detalhe completo do card: o resumo de cardInclude + comentários e anexos.
const cardDetailInclude = {
  ...cardInclude,
  comments: {
    include: {
      author: true,
      attachments: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  },
  // Anexos do card (não os de comentário) — comentários trazem os seus.
  attachments: { where: { commentId: null }, orderBy: { createdAt: "asc" } },
  // Sobrescreve o children resumido de cardInclude: subtarefas precisam de code/title/type.
  children: {
    where: { archivedAt: null },
    select: { id: true, code: true, title: true, type: true, column: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  },
} as const;

export function getCard(id: string) {
  return db.card.findUnique({ where: { id }, include: cardDetailInclude });
}

// Normaliza a chave digitada por gente/agente: "ti-282", "TI 282" e "282" todos
// viram "TI-282". Sem prefixo assume o padrão global de chave (TI-).
export function normalizeCardCode(input: string): string {
  const raw = input.trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d+$/.test(raw)) return `${CARD_CODE_PREFIX}${raw}`;
  const m = raw.match(/^([A-Z]+)[-_]?(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : raw;
}

// Busca o card pela CHAVE (TI-282) em vez do id. Mesmo payload do getCard.
// `code` não é unique no schema (chaves manuais são permitidas), então usamos
// findFirst — se houver duplicata, vem a mais antiga.
export function getCardByCode(code: string) {
  return db.card.findFirst({
    where: { code: normalizeCardCode(code) },
    orderBy: { createdAt: "asc" },
    include: cardDetailInclude,
  });
}

export function addAttachment(input: {
  cardId: string; url: string; name: string;
  contentType?: string | null; size?: number | null; commentId?: string | null;
}) {
  return db.attachment.create({
    data: {
      cardId: input.cardId, url: input.url, name: input.name,
      contentType: input.contentType ?? null, size: input.size ?? null,
      commentId: input.commentId ?? null,
    },
  });
}

// Anexos a nível de card (commentId null). Os de comentário vêm via getCard.
export function listAttachments(cardId: string) {
  return db.attachment.findMany({
    where: { cardId, commentId: null }, orderBy: { createdAt: "asc" },
  });
}

export function getAttachment(id: string) {
  return db.attachment.findUnique({ where: { id } });
}

export function deleteAttachment(id: string) {
  return db.attachment.delete({ where: { id } });
}

// Apaga o card. Cascade remove comments/attachments no DB; devolve as URLs
// dos blobs (card + comentários) p/ a rota limpar o Vercel Blob (best-effort).
export async function deleteCard(id: string): Promise<{ urls: string[] } | null> {
  const card = await db.card.findUnique({
    where: { id },
    include: {
      attachments: { select: { url: true } },
      comments: { select: { attachments: { select: { url: true } } } },
    },
  });
  if (!card) return null;
  const urls = [
    ...card.attachments.map((a) => a.url),
    ...card.comments.flatMap((c) => c.attachments.map((a) => a.url)),
  ];
  await db.card.delete({ where: { id } });
  return { urls };
}

// Arquiva (soft-delete reversível): some do board, mas continua no DB.
export function archiveCard(id: string) {
  return db.card.update({ where: { id }, data: { archivedAt: new Date() }, include: cardInclude });
}

// Restaura um card arquivado de volta pro board.
export function unarchiveCard(id: string) {
  return db.card.update({ where: { id }, data: { archivedAt: null }, include: cardInclude });
}

// Lista os cards arquivados, com o nome da coluna de origem.
export function listArchivedCards() {
  return db.card.findMany({
    where: { archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    include: { ...cardInclude, column: { select: { name: true } } },
  });
}

// Adiciona responsável(is) sem remover os demais (connect, idempotente).
export async function assignCard(id: string, assignees: string[]) {
  const ids = await resolveUserIds(assignees);
  return db.card.update({
    where: { id },
    data: { assignees: { connect: ids.map((i) => ({ id: i })) } },
    include: cardInclude,
  });
}

// Remove responsável(is) sem mexer nos demais (disconnect).
export async function unassignCard(id: string, assignees: string[]) {
  const ids = await resolveUserIds(assignees);
  return db.card.update({
    where: { id },
    data: { assignees: { disconnect: ids.map((i) => ({ id: i })) } },
    include: cardInclude,
  });
}

export async function createCard(input: CreateCardInput) {
  const columnId = await resolveColumnId(input);
  const last = await db.card.findMany({
    where: { columnId }, orderBy: { position: "desc" }, take: 1,
  });
  const position = positionBetween(last[0]?.position ?? null, null);
  const assigneeIds = await resolveUserIds(input.assignees ?? []);
  const labelIds = await resolveLabelIds(input.labels ?? []);
  const code = input.code?.trim() ? input.code.trim() : await nextCardCode();
  const requestedById = await resolveUserId(input.requestedBy);
  const card = await db.card.create({
    data: {
      columnId, title: input.title, details: input.details ?? input.description,
      documentation: input.documentation,
      priority: input.priority, type: input.type, version: input.version,
      branchUrl: input.branchUrl, requestedById,
      code, position,
      parentId: input.parentId ?? null,
      blocker: input.blocker ?? null,
      blockerReason: input.blockerReason ?? null,
      bot: input.bot ?? false,
      assignees: { connect: assigneeIds.map((id) => ({ id })) },
      labels: { connect: labelIds.map((id) => ({ id })) },
    },
    include: cardInclude,
  });
  await dispatchCardCreated(card);
  return card;
}

export async function updateCard(id: string, input: UpdateCardInput, actor?: string) {
  if (input.parentId === id) throw new Error("Um card não pode ser pai de si mesmo");
  const assignees = input.assignees
    ? { set: (await resolveUserIds(input.assignees)).map((id) => ({ id })) }
    : undefined;
  const labels = input.labels
    ? { set: (await resolveLabelIds(input.labels)).map((id) => ({ id })) }
    : undefined;
  const dueDate =
    input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(input.dueDate);
  // undefined = não mexe; null = limpa; string = resolve para id.
  const requestedById =
    input.requestedBy === undefined ? undefined : await resolveUserId(input.requestedBy);
  const actorId = await resolveUserId(actor);
  return db.$transaction(async (tx) => {
    const before = await tx.card.findUnique({
      where: { id }, select: { blocker: true },
    });
    const updated = await tx.card.update({
      where: { id },
      data: {
        title: input.title, details: input.details !== undefined ? input.details : input.description,
        documentation: input.documentation,
        priority: input.priority, type: input.type, version: input.version,
        branchUrl: input.branchUrl, requestedById,
        code: input.code, dueDate, assignees, labels,
        parentId: input.parentId,
        blocker: input.blocker,
        blockerReason: input.blockerReason,
        bot: input.bot,
      },
      include: cardInclude,
    });
    if (before && input.blocker !== undefined && before.blocker !== input.blocker) {
      await notifyBlockerChange(tx, id, actorId, before.blocker, input.blocker);
    }
    return updated;
  });
}

// Liga/desliga a marca de "operado por robô". Caminho próprio em vez de um
// updateCard genérico: é a única escrita que um agente faz sem tocar em mais
// nada do card, e não deve arrastar resolução de assignee/label/notificação.
export function setCardBot(id: string, bot: boolean) {
  return db.card.update({ where: { id }, data: { bot }, include: cardInclude });
}

export async function moveCard(id: string, columnIdRef: string, position?: number, actor?: string) {
  const actorId = await resolveUserId(actor);
  const result = await db.$transaction(async (tx) => {
    const current = await tx.card.findUnique({
      where: { id }, select: { columnId: true, blocker: true, column: { select: { id: true, name: true } } },
    });
    if (!current) throw new Error(`Card não encontrado: ${id}`);
    const target = columnIdRef
      ? await tx.column.findUnique({
          where: { id: columnIdRef }, select: { id: true, name: true },
        }) ?? await tx.column.findFirst({
          where: { name: columnIdRef }, select: { id: true, name: true },
        })
      : await tx.column.findUnique({
          where: { id: current.columnId }, select: { id: true, name: true },
        });
    if (!target) throw new Error(`Coluna não encontrada: ${columnIdRef || current.columnId}`);
    // Bloqueio que trava impede mudar DE coluna; reorder na mesma coluna passa.
    if (target.id !== current.columnId && current.blocker && BLOCKING_MOVE.includes(current.blocker)) {
      throw new Error(`Card em ${BLOCKER_LABEL[current.blocker]} não pode mudar de coluna`);
    }
    let pos = position;
    if (pos == null) {
      const last = await tx.card.findMany({
        where: { columnId: target.id }, orderBy: { position: "desc" }, take: 1,
      });
      pos = positionBetween(last[0]?.position ?? null, null);
    }
    // Moveu p/ "Em Andamento" + actor informado → vira responsável (connect, não remove os outros).
    const assignees = target.id !== current.columnId && actorId && /andamento/i.test(target.name)
      ? { connect: [{ id: actorId }] }
      : undefined;
    const moved = await tx.card.update({
      where: { id }, data: { columnId: target.id, position: pos, assignees }, include: cardInclude,
    });
    await notifyCardMoved(tx, id, actorId, current.columnId, target);
    const fromColumn = target.id === current.columnId ? null : current.column;
    return { moved, fromColumn, toColumn: target };
  });
  if (result.fromColumn) await dispatchCardMoved(id, result.fromColumn, result.toColumn);
  return result.moved;
}

export async function addComment(
  cardId: string, body: string, authorId?: string, attachmentIds?: string[],
) {
  return db.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { cardId, body, authorId } });
    // Vincula anexos já enviados (commentId null neste card) ao novo comentário.
    if (attachmentIds?.length) {
      await tx.attachment.updateMany({
        where: { id: { in: attachmentIds }, cardId, commentId: null },
        data: { commentId: c.id },
      });
    }
    await notifyComment(tx, cardId, authorId);
    return { id: c.id };
  });
}

export function getComment(id: string) {
  return db.comment.findUnique({ where: { id } });
}

export async function updateComment(id: string, body: string) {
  await db.comment.update({ where: { id }, data: { body } });
  return { id };
}

// Exclusão definitiva do comentário. Cascade remove os anexos no DB; devolvemos
// as URLs p/ a rota limpar o Vercel Blob (mesmo contrato de deleteCard).
export async function deleteComment(id: string): Promise<{ urls: string[] } | null> {
  const comment = await db.comment.findUnique({
    where: { id },
    select: { id: true, attachments: { select: { url: true } } },
  });
  if (!comment) return null;
  await db.comment.delete({ where: { id } });
  return { urls: comment.attachments.map((a) => a.url) };
}

export const listUsers = () => db.user.findMany({ orderBy: { name: "asc" } });
export const listLabels = () => db.label.findMany({ orderBy: { name: "asc" } });

// Assinatura barata do estado do board para polling de tempo real.
// Muda em edição (updatedAt), criação/exclusão (count), comentário
// (commentCount) e em qualquer mexida nas colunas (colSig).
export async function boardVersion(): Promise<string> {
  const [agg, cardCount, commentCount, attachmentCount, columns] = await Promise.all([
    db.card.aggregate({ _max: { updatedAt: true } }),
    db.card.count(),
    db.comment.count(),
    db.attachment.count(),
    // Column não tem updatedAt; a lista é pequena (uma dezena de linhas), então
    // a própria estrutura serve de assinatura — pega renomear, recolorir e mover.
    db.column.findMany({
      orderBy: { position: "asc" },
      select: { id: true, name: true, color: true, position: true },
    }),
  ]);
  const ts = agg._max.updatedAt?.getTime() ?? 0;
  const colSig = columns.map((c) => `${c.id}:${c.name}:${c.color ?? ""}:${c.position}`).join("|");
  return `${ts}-${cardCount}-${commentCount}-${attachmentCount}-${hash(colSig)}`;
}

// Hash curto e estável (FNV-1a) só p/ compactar a assinatura das colunas.
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export type { CardFilter, CreateCardInput, UpdateCardInput } from "./types";
