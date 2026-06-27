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
    include: { ...cardInclude, comments: { include: { author: true }, orderBy: { createdAt: "asc" } } },
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
  return db.card.create({
    data: {
      columnId, title: input.title, description: input.description,
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
      title: input.title, description: input.description,
      priority: input.priority, code: input.code, dueDate, assignees, labels,
    },
    include: cardInclude,
  });
}

export async function moveCard(id: string, columnIdRef: string, position?: number) {
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
  return db.card.update({
    where: { id }, data: { columnId, position: pos }, include: cardInclude,
  });
}

export async function addComment(cardId: string, body: string, authorId?: string) {
  const c = await db.comment.create({ data: { cardId, body, authorId } });
  return { id: c.id };
}

export const listUsers = () => db.user.findMany({ orderBy: { name: "asc" } });
export const listLabels = () => db.label.findMany({ orderBy: { name: "asc" } });

export type { CardFilter, CreateCardInput, UpdateCardInput } from "./types";
