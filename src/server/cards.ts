import { db } from "@/lib/db";
import { positionBetween } from "@/lib/positions";
import type {
  CardFilter, CreateCardInput, UpdateCardInput,
} from "./types";

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

// Próxima Chave sequencial global (TI-1, TI-2, …). Considera cards arquivados
// para nunca reusar número. Baseado no maior sufixo numérico existente.
export async function nextCardCode(): Promise<string> {
  const rows = await db.card.findMany({
    where: { code: { startsWith: CARD_CODE_PREFIX } },
    select: { code: true },
  });
  const max = rows.reduce((m, { code }) => {
    const n = Number(code!.slice(CARD_CODE_PREFIX.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${CARD_CODE_PREFIX}${max + 1}`;
}

export async function listColumns() {
  return db.column.findMany({
    orderBy: { position: "asc" },
    include: {
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

export function getCard(id: string) {
  return db.card.findUnique({
    where: { id },
    include: {
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
    },
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
  return db.card.create({
    data: {
      columnId, title: input.title, details: input.details ?? input.description,
      priority: input.priority, type: input.type, version: input.version,
      branchUrl: input.branchUrl, requestedById,
      code, position,
      parentId: input.parentId ?? null,
      blocker: input.blocker ?? null,
      blockerReason: input.blockerReason ?? null,
      assignees: { connect: assigneeIds.map((id) => ({ id })) },
      labels: { connect: labelIds.map((id) => ({ id })) },
    },
    include: cardInclude,
  });
}

export async function updateCard(id: string, input: UpdateCardInput) {
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
  return db.card.update({
    where: { id },
    data: {
      title: input.title, details: input.details !== undefined ? input.details : input.description,
      priority: input.priority, type: input.type, version: input.version,
      branchUrl: input.branchUrl, requestedById,
      code: input.code, dueDate, assignees, labels,
      parentId: input.parentId,
      blocker: input.blocker,
      blockerReason: input.blockerReason,
    },
    include: cardInclude,
  });
}

export async function moveCard(id: string, columnIdRef: string, position?: number, actor?: string) {
  let columnId: string;
  if (!columnIdRef) {
    const card = await db.card.findUnique({ where: { id }, select: { columnId: true } });
    if (!card) throw new Error(`Card não encontrado: ${id}`);
    columnId = card.columnId;
  } else {
    columnId = await resolveColumnId({ columnId: columnIdRef, columnName: columnIdRef });
  }
  let pos = position;
  if (pos == null) {
    const last = await db.card.findMany({
      where: { columnId }, orderBy: { position: "desc" }, take: 1,
    });
    pos = positionBetween(last[0]?.position ?? null, null);
  }
  // Moveu p/ "Em Andamento" + actor informado → vira responsável (connect, não remove os outros).
  let assignees: { connect: { id: string }[] } | undefined;
  if (actor) {
    const col = await db.column.findUnique({ where: { id: columnId }, select: { name: true } });
    if (col && /andamento/i.test(col.name)) {
      const [actorId] = await resolveUserIds([actor]);
      if (actorId) assignees = { connect: [{ id: actorId }] };
    }
  }
  return db.card.update({
    where: { id }, data: { columnId, position: pos, assignees }, include: cardInclude,
  });
}

export async function addComment(
  cardId: string, body: string, authorId?: string, attachmentIds?: string[],
) {
  const c = await db.comment.create({ data: { cardId, body, authorId } });
  // Vincula anexos já enviados (commentId null neste card) ao novo comentário.
  if (attachmentIds?.length) {
    await db.attachment.updateMany({
      where: { id: { in: attachmentIds }, cardId, commentId: null },
      data: { commentId: c.id },
    });
  }
  return { id: c.id };
}

export function getComment(id: string) {
  return db.comment.findUnique({ where: { id } });
}

export async function updateComment(id: string, body: string) {
  await db.comment.update({ where: { id }, data: { body } });
  return { id };
}

export const listUsers = () => db.user.findMany({ orderBy: { name: "asc" } });
export const listLabels = () => db.label.findMany({ orderBy: { name: "asc" } });

// Assinatura barata do estado do board para polling de tempo real.
// Muda em edição (updatedAt), criação/exclusão (count) e comentário (commentCount).
export async function boardVersion(): Promise<string> {
  const [agg, cardCount, commentCount, attachmentCount] = await Promise.all([
    db.card.aggregate({ _max: { updatedAt: true } }),
    db.card.count(),
    db.comment.count(),
    db.attachment.count(),
  ]);
  const ts = agg._max.updatedAt?.getTime() ?? 0;
  return `${ts}-${cardCount}-${commentCount}-${attachmentCount}`;
}

export type { CardFilter, CreateCardInput, UpdateCardInput } from "./types";
