import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient;

export type NotificationRow = {
  recipientId: string;
  actorId: string | null;
  cardId: string;
  type: NotificationType;
  message: string;
};

export function buildNotificationRows(input: {
  recipientIds: string[];
  actorId?: string | null;
  cardId: string;
  type: NotificationType;
  message: string;
}): NotificationRow[] {
  return [...new Set(input.recipientIds)]
    .filter((id) => id !== input.actorId)
    .map((recipientId) => ({
      recipientId,
      actorId: input.actorId ?? null,
      cardId: input.cardId,
      type: input.type,
      message: input.message,
    }));
}

export function cardRef(card: { code: string | null; title: string }) {
  return card.code ? `${card.code} · ${card.title}` : card.title;
}

export const notificationMessage = {
  comment: (ref: string) => `Novo comentário em ${ref}`,
  ready: (ref: string) => `${ref} foi liberado para teste`,
  entered: (ref: string, column: string) => `${ref} entrou em ${column}`,
  blockerAdded: (ref: string, blocker: string) => `${blocker} adicionado em ${ref}`,
  blockerRemoved: (ref: string, blocker: string) => `${blocker} removido de ${ref}`,
  blockerChanged: (ref: string, before: string, after: string) =>
    `Bloqueio de ${ref} alterado de ${before} para ${after}`,
};

type NotifiableCard = {
  id: string;
  code: string | null;
  title: string;
  requestedById: string | null;
  assignees: { id: string }[];
};

async function findNotifiableCard(tx: Tx, cardId: string): Promise<NotifiableCard> {
  return tx.card.findUniqueOrThrow({
    where: { id: cardId },
    select: {
      id: true,
      code: true,
      title: true,
      requestedById: true,
      assignees: { select: { id: true } },
    },
  });
}

function cardRecipients(card: NotifiableCard) {
  return [
    ...card.assignees.map((assignee) => assignee.id),
    ...(card.requestedById ? [card.requestedById] : []),
  ];
}

export async function notifyComment(tx: Tx, cardId: string, actorId?: string | null) {
  const card = await findNotifiableCard(tx, cardId);
  const rows = buildNotificationRows({
    actorId,
    cardId,
    type: "COMMENT_ADDED",
    message: notificationMessage.comment(cardRef(card)),
    recipientIds: cardRecipients(card),
  });
  if (rows.length) await tx.notification.createMany({ data: rows });
}

export async function notifyBlockerChange(
  tx: Tx,
  cardId: string,
  actorId: string | null | undefined,
  before: string | null,
  after: string | null,
) {
  if (before === after) return;

  const type: NotificationType = before == null ? "BLOCKER_ADDED"
    : after == null ? "BLOCKER_REMOVED"
    : "BLOCKER_CHANGED";
  const card = await findNotifiableCard(tx, cardId);
  const ref = cardRef(card);
  const message = before == null
    ? notificationMessage.blockerAdded(ref, after!)
    : after == null
      ? notificationMessage.blockerRemoved(ref, before)
      : notificationMessage.blockerChanged(ref, before, after);
  const rows = buildNotificationRows({
    actorId,
    cardId,
    type,
    message,
    recipientIds: cardRecipients(card),
  });
  if (rows.length) await tx.notification.createMany({ data: rows });
}

export async function notifyCardMoved(
  tx: Tx,
  cardId: string,
  actorId: string | null | undefined,
  fromColumnId: string,
  target: { id: string; name: string },
) {
  if (fromColumnId === target.id) return;

  const [card, subscriptions] = await Promise.all([
    findNotifiableCard(tx, cardId),
    tx.columnSubscription.findMany({
      where: { columnId: target.id },
      select: { userId: true },
    }),
  ]);
  const ref = cardRef(card);
  const readyRecipientIds = target.name === "Aguardando Teste" ? cardRecipients(card) : [];
  const readyRows = target.name === "Aguardando Teste"
    ? buildNotificationRows({
      actorId,
      cardId,
      type: "CARD_READY_FOR_TEST",
      message: notificationMessage.ready(ref),
      recipientIds: readyRecipientIds,
    })
    : [];
  const enteredRows = buildNotificationRows({
    actorId,
    cardId,
    type: "CARD_ENTERED_COLUMN",
    message: notificationMessage.entered(ref, target.name),
    recipientIds: subscriptions
      .map((subscription) => subscription.userId)
      .filter((userId) => !readyRecipientIds.includes(userId)),
  });
  const rows = [...readyRows, ...enteredRows];
  if (rows.length) await tx.notification.createMany({ data: rows });
}

export async function listNotifications(recipientId: string, input: { cursor?: string; limit: number }) {
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { recipientId },
      take: input.limit + 1,
      orderBy: { sequence: "desc" },
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    db.notification.count({ where: { recipientId, readAt: null } }),
  ]);
  const hasMore = notifications.length > input.limit;
  const page = notifications.slice(0, input.limit);
  const items = page.map(({ sequence, ...notification }) => ({
    ...notification,
    sequence: sequence.toString(),
  }));
  return { items, nextCursor: hasMore ? page[input.limit - 1].id : null, unreadCount };
}

export async function notificationVersion(recipientId: string): Promise<{
  version: string;
  unreadCount: number;
  totalCount: number;
  latestId: string | null;
  latestCreatedAt: string | null;
  latestSequence: string | null;
}> {
  const [latest, totalCount, unreadCount] = await Promise.all([
    db.notification.findFirst({
      where: { recipientId },
      orderBy: { sequence: "desc" },
      select: { id: true, sequence: true, createdAt: true },
    }),
    db.notification.count({ where: { recipientId } }),
    db.notification.count({ where: { recipientId, readAt: null } }),
  ]);
  const latestCreatedAt = latest?.createdAt.toISOString() ?? null;
  const latestSequence = latest?.sequence.toString() ?? null;
  return {
    version: `${latestSequence ?? "none"}-${totalCount}-${unreadCount}`,
    unreadCount,
    totalCount,
    latestId: latest?.id ?? null,
    latestCreatedAt,
    latestSequence,
  };
}

export async function setNotificationRead(recipientId: string, id: string, read: boolean) {
  const result = await db.notification.updateMany({
    where: { id, recipientId },
    data: { readAt: read ? new Date() : null },
  });
  if (result.count === 0) throw new Error("Notificação não encontrada");
  return { ok: true };
}

export async function markAllNotificationsRead(recipientId: string) {
  await db.notification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

async function validateColumnAndUser(columnId: string, userId: string) {
  const [column, user] = await Promise.all([
    db.column.findUnique({ where: { id: columnId } }),
    db.user.findUnique({ where: { id: userId } }),
  ]);
  if (!column) throw new Error("Coluna não encontrada");
  if (!user) throw new Error("Usuário não encontrado");
}

export async function listColumnSubscribers(columnId: string) {
  const column = await db.column.findUnique({ where: { id: columnId }, select: { id: true } });
  if (!column) throw new Error("Coluna não encontrada");
  return db.columnSubscription.findMany({
    where: { columnId },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
}

export async function subscribeToColumn(columnId: string, userId: string) {
  await validateColumnAndUser(columnId, userId);
  return db.columnSubscription.upsert({
    where: { columnId_userId: { columnId, userId } },
    create: { columnId, userId },
    update: {},
  });
}

export async function unsubscribeFromColumn(columnId: string, userId: string) {
  await validateColumnAndUser(columnId, userId);
  await db.columnSubscription.deleteMany({ where: { columnId, userId } });
  return { ok: true };
}
