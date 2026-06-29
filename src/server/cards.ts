import { db } from "@/lib/db";
import { positionBetween } from "@/lib/positions";
import type {
  CardFilter, CreateCardInput, UpdateCardInput,
} from "./types";

const cardInclude = {
  assignees: true,
  labels: true,
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
    where: { OR: [{ id: { in: refs } }, { name: { in: refs } }] },
  });
  return users.map((u) => u.id);
}

async function resolveLabelIds(refs: string[]): Promise<string[]> {
  if (!refs.length) return [];
  const labels = await db.label.findMany({
    where: { OR: [{ id: { in: refs } }, { name: { in: refs } }] },
  });
  return labels.map((l) => l.id);
}

export async function listColumns() {
  return db.column.findMany({
    orderBy: { position: "asc" },
    include: { cards: { orderBy: { position: "asc" }, include: cardInclude } },
  });
}

export async function listCards(filter: CardFilter) {
  const columnId = filter.columnId ?? (filter.columnName
    ? (await db.column.findFirst({ where: { name: filter.columnName } }))?.id
    : undefined);
  return db.card.findMany({
    where: {
      ...(columnId ? { columnId } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.assignee
        ? { assignees: { some: { OR: [{ id: filter.assignee }, { name: filter.assignee }] } } }
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
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
}

export function addAttachment(input: {
  cardId: string; url: string; name: string; contentType?: string | null; size?: number | null;
}) {
  return db.attachment.create({
    data: {
      cardId: input.cardId, url: input.url, name: input.name,
      contentType: input.contentType ?? null, size: input.size ?? null,
    },
  });
}

export function listAttachments(cardId: string) {
  return db.attachment.findMany({ where: { cardId }, orderBy: { createdAt: "asc" } });
}

export function deleteAttachment(id: string) {
  return db.attachment.delete({ where: { id } });
}

export async function createCard(input: CreateCardInput) {
  const columnId = await resolveColumnId(input);
  const last = await db.card.findMany({
    where: { columnId }, orderBy: { position: "desc" }, take: 1,
  });
  const position = positionBetween(last[0]?.position ?? null, null);
  const assigneeIds = await resolveUserIds(input.assignees ?? []);
  const labelIds = await resolveLabelIds(input.labels ?? []);
  return db.card.create({
    data: {
      columnId, title: input.title, details: input.details ?? input.description,
      priority: input.priority, code: input.code, position,
      assignees: { connect: assigneeIds.map((id) => ({ id })) },
      labels: { connect: labelIds.map((id) => ({ id })) },
    },
    include: cardInclude,
  });
}

export async function updateCard(id: string, input: UpdateCardInput) {
  const assignees = input.assignees
    ? { set: (await resolveUserIds(input.assignees)).map((id) => ({ id })) }
    : undefined;
  const labels = input.labels
    ? { set: (await resolveLabelIds(input.labels)).map((id) => ({ id })) }
    : undefined;
  const dueDate =
    input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(input.dueDate);
  return db.card.update({
    where: { id },
    data: {
      title: input.title, details: input.details !== undefined ? input.details : input.description,
      priority: input.priority, code: input.code, dueDate, assignees, labels,
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

export async function addComment(cardId: string, body: string, authorId?: string) {
  const c = await db.comment.create({ data: { cardId, body, authorId } });
  return { id: c.id };
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
