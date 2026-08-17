# TI-258 — Notificações no Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar notificações in-app persistentes para eventos de card e inscrições por coluna, com histórico lida/não lida, deep-link, polling leve e alerta sonoro.

**Architecture:** PostgreSQL guarda `Notification` e `ColumnSubscription`; `src/server/notifications.ts` concentra destinatários, persistência, leitura e versão. `moveCard`, `updateCard` e `addComment` emitem eventos dentro da mesma transação Prisma usada pela mutação. A UI consulta uma assinatura leve a cada três segundos e carrega a lista paginada somente quando necessário.

**Tech Stack:** Next.js 16, React 19, Prisma 7/PostgreSQL, Clerk, TanStack React Query 5, Vitest 4, Tailwind CSS 4, Radix/shadcn, lucide-react e Web Audio API.

## Global Constraints

- Ações próprias não geram notificação para o autor identificado.
- Um destinatário com múltiplos papéis recebe somente uma notificação por evento.
- `CARD_READY_FOR_TEST` prevalece sobre `CARD_ENTERED_COLUMN` ao entrar em `Aguardando Teste`.
- O primeiro carregamento nunca toca som; cada lote posterior toca no máximo uma vez.
- Com a aba focada, suprimir o som somente quando todas as notificações novas pertencem ao card aberto.
- Central em popover compacto; sino Lucide `Bell` em contorno, sem fundo permanente.
- Badge numérico limitado visualmente a `99+`.
- Polling de versão a cada `3_000 ms`; a lista completa não é consultada a cada ciclo.
- Histórico sem expiração automática; exclusão definitiva do card remove suas notificações por cascade.
- APIs REST exigem Clerk e derivam o destinatário da sessão.
- Não adicionar WebSocket, SSE, fila, canal externo ou preferências de mute.
- Testes seguem o padrão atual: Vitest em ambiente `node`, Prisma e serviços mockados. UI é coberta por helpers puros, TypeScript, lint, build e validação manual.
- Migrations de produção usam `DIRECT_URL`, nunca o pooler.
- Cada task termina com testes verdes e um commit próprio com escopo `TI-258`.

## Mapa de arquivos

### Novos

- `prisma/migrations/20260817190000_ti258_notifications/migration.sql` — enum, tabelas, índices e FKs.
- `src/server/notifications.ts` — regras de destinatários, CRUD, versão e inscrições.
- `src/server/notifications.test.ts` — testes unitários do domínio.
- `src/app/api/notifications/route.ts` e `.test.ts` — paginação da central.
- `src/app/api/notifications/version/route.ts` e `.test.ts` — assinatura leve e não lidas.
- `src/app/api/notifications/[id]/route.ts` e `.test.ts` — lida/não lida individual.
- `src/app/api/notifications/read-all/route.ts` e `.test.ts` — leitura em lote.
- `src/app/api/columns/[id]/subscribers/route.ts` e `.test.ts` — lista de inscritos.
- `src/app/api/columns/[id]/subscribers/[userId]/route.ts` e `.test.ts` — add/remove incremental.
- `src/components/board/notification-client.ts` e `.test.ts` — tipos, paginação, badge, detecção de lote e som.
- `src/components/board/NotificationCenter.tsx` — sino global e popover.
- `src/components/board/column-subscribers.ts` e `.test.ts` — update otimista puro.
- `src/components/board/ColumnSubscribersPopover.tsx` — gestão visual de inscritos.

### Modificados

- `prisma/schema.prisma` — enum, relações e modelos.
- `src/server/cards.ts` e `src/server/cards.test.ts` — transações e emissão dos eventos.
- `src/app/api/cards/[id]/route.ts` e novo `route.test.ts` — autor e remoção da autoatribuição duplicada.
- `src/app/api/cards/[id]/comments/route.ts` e novo `route.test.ts` — autor do comentário.
- `src/mcp/server.ts` e `src/mcp/server.test.ts` — `actor` no `update_card` e encaminhamento consistente.
- `src/components/board/BoardApp.tsx` — card aberto entregue à central.
- `src/components/board/Chrome.tsx` — monta `NotificationCenter`.
- `src/components/board/Board.tsx` — repassa usuários às colunas.
- `src/components/board/Column.tsx` — contador e popover de inscritos.
- `docs/superpowers/specs/2026-08-17-ti-258-notificacoes-board-design.md` — registrar Web Audio em vez de asset binário.

---

### Task 1: Schema e migration de notificações

**Files:**
- Modify: `prisma/schema.prisma:23-129`
- Create: `prisma/migrations/20260817190000_ti258_notifications/migration.sql`

**Interfaces:**
- Produces: enum Prisma `NotificationType`.
- Produces: models `Notification` e `ColumnSubscription` e relações em `Column`, `Card` e `User`.

- [ ] **Step 1: Adicionar enum, relações e modelos ao schema**

Após `Blocker`, adicionar:

```prisma
enum NotificationType {
  CARD_READY_FOR_TEST
  CARD_ENTERED_COLUMN
  COMMENT_ADDED
  BLOCKER_ADDED
  BLOCKER_REMOVED
  BLOCKER_CHANGED
}
```

Adicionar `subscriptions ColumnSubscription[]` em `Column`, `notifications Notification[]` em `Card` e estas relações em `User`:

```prisma
  receivedNotifications Notification[]         @relation("NotificationRecipient")
  notificationActions   Notification[]         @relation("NotificationActor")
  columnSubscriptions   ColumnSubscription[]
```

Adicionar ao fim do schema:

```prisma
model Notification {
  id          String           @id @default(cuid())
  recipientId String
  recipient   User             @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actorId     String?
  actor       User?            @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  cardId      String
  card        Card             @relation(fields: [cardId], references: [id], onDelete: Cascade)
  type        NotificationType
  message     String           @db.Text
  readAt      DateTime?
  createdAt   DateTime         @default(now())

  @@index([recipientId, createdAt])
  @@index([recipientId, readAt, createdAt])
  @@index([cardId])
}

model ColumnSubscription {
  columnId String
  column   Column   @relation(fields: [columnId], references: [id], onDelete: Cascade)
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@id([columnId, userId])
  @@index([userId])
}
```

- [ ] **Step 2: Criar a migration SQL exata**

Criar `prisma/migrations/20260817190000_ti258_notifications/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'CARD_READY_FOR_TEST',
  'CARD_ENTERED_COLUMN',
  'COMMENT_ADDED',
  'BLOCKER_ADDED',
  'BLOCKER_REMOVED',
  'BLOCKER_CHANGED'
);

-- CreateTable
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "cardId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "message" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColumnSubscription" (
  "columnId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ColumnSubscription_pkey" PRIMARY KEY ("columnId", "userId")
);

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX "Notification_cardId_idx" ON "Notification"("cardId");
CREATE INDEX "ColumnSubscription_userId_idx" ON "ColumnSubscription"("userId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ColumnSubscription" ADD CONSTRAINT "ColumnSubscription_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ColumnSubscription" ADD CONSTRAINT "ColumnSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validar schema e gerar o client**

Run: `npx prisma format && npx prisma validate && npx prisma generate`

Expected: os três comandos terminam com exit code `0`; `@prisma/client` exporta `NotificationType`.

- [ ] **Step 4: Rodar testes de regressão antes do domínio novo**

Run: `npm test`

Expected: suíte atual passa sem alteração de comportamento.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260817190000_ti258_notifications/migration.sql
git commit -m "feat(TI-258): adiciona schema de notificacoes"
```

---

### Task 2: Serviço de domínio, histórico e inscrições

**Files:**
- Create: `src/server/notifications.ts`
- Create: `src/server/notifications.test.ts`

**Interfaces:**
- Produces: `buildNotificationRows(input): NotificationRow[]`.
- Produces: `notifyComment`, `notifyBlockerChange` e `notifyCardMoved`, todos recebendo `Prisma.TransactionClient`.
- Produces: `listNotifications`, `notificationVersion`, `setNotificationRead`, `markAllNotificationsRead`.
- Produces: `listColumnSubscribers`, `subscribeToColumn`, `unsubscribeFromColumn`.

- [ ] **Step 1: Escrever testes puros de destinatários e prioridade**

Criar `src/server/notifications.test.ts` com o mock do Prisma e estes casos centrais:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  notification: {
    findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(),
    updateMany: vi.fn(), createMany: vi.fn(),
  },
  columnSubscription: {
    findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(),
  },
  column: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { buildNotificationRows } from "./notifications";

describe("buildNotificationRows", () => {
  it("deduplica papéis e remove o autor", () => {
    expect(buildNotificationRows({
      actorId: "u1", cardId: "c1", type: "COMMENT_ADDED",
      message: "Comentário em TI-258", recipientIds: ["u1", "u2", "u2"],
    })).toEqual([{ recipientId: "u2", actorId: "u1", cardId: "c1",
      type: "COMMENT_ADDED", message: "Comentário em TI-258" }]);
  });

  it("não suprime ninguém sem autor identificável", () => {
    expect(buildNotificationRows({
      actorId: null, cardId: "c1", type: "BLOCKER_ADDED",
      message: "Impedimento em TI-258", recipientIds: ["u1", "u2"],
    }).map((x) => x.recipientId)).toEqual(["u1", "u2"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/server/notifications.test.ts`

Expected: FAIL porque `./notifications` ainda não existe.

- [ ] **Step 3: Implementar tipos, helpers e mensagens**

Criar `src/server/notifications.ts` com estas assinaturas públicas:

```ts
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
```

Implementar mensagens determinísticas em pt-BR:

```ts
export const notificationMessage = {
  comment: (ref: string) => `Novo comentário em ${ref}`,
  ready: (ref: string) => `${ref} foi liberado para teste`,
  entered: (ref: string, column: string) => `${ref} entrou em ${column}`,
  blockerAdded: (ref: string, blocker: string) => `${blocker} adicionado em ${ref}`,
  blockerRemoved: (ref: string, blocker: string) => `${blocker} removido de ${ref}`,
  blockerChanged: (ref: string, before: string, after: string) =>
    `Bloqueio de ${ref} alterado de ${before} para ${after}`,
};
```

- [ ] **Step 4: Implementar os emissores transacionais**

Adicionar:

```ts
export async function notifyComment(tx: Tx, cardId: string, actorId?: string | null) {
  const card = await tx.card.findUniqueOrThrow({
    where: { id: cardId },
    select: { id: true, code: true, title: true, requestedById: true,
      assignees: { select: { id: true } } },
  });
  const rows = buildNotificationRows({
    actorId, cardId, type: "COMMENT_ADDED",
    message: notificationMessage.comment(cardRef(card)),
    recipientIds: [...card.assignees.map((x) => x.id), ...(card.requestedById ? [card.requestedById] : [])],
  });
  if (rows.length) await tx.notification.createMany({ data: rows });
}
```

Implementar `notifyBlockerChange(tx, cardId, actorId, before, after)` com estas regras exatas:

```ts
if (before === after) return;
const type = before == null ? "BLOCKER_ADDED"
  : after == null ? "BLOCKER_REMOVED"
  : "BLOCKER_CHANGED";
```

Implementar `notifyCardMoved(tx, cardId, actorId, fromColumnId, target)` onde `target` é `{ id: string; name: string }`:

- retornar sem criar quando `fromColumnId === target.id`;
- carregar card e `ColumnSubscription` da coluna alvo;
- criar `CARD_READY_FOR_TEST` para responsável/solicitante se `target.name === "Aguardando Teste"`;
- criar `CARD_ENTERED_COLUMN` para inscritos restantes;
- remover dos inscritos quem já recebeu `CARD_READY_FOR_TEST`;
- suprimir `actorId` nos dois grupos.

- [ ] **Step 5: Implementar histórico, versão e leitura**

Adicionar os contratos:

```ts
export async function listNotifications(recipientId: string, input: { cursor?: string; limit: number })
export async function notificationVersion(recipientId: string): Promise<{
  version: string; unreadCount: number; totalCount: number; latestId: string | null;
}>
export async function setNotificationRead(recipientId: string, id: string, read: boolean)
export async function markAllNotificationsRead(recipientId: string)
```

`listNotifications` usa `take: limit + 1`, `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, cursor por `id`, `skip: 1` quando houver cursor e retorna:

```ts
include: {
  actor: { select: { id: true, name: true, avatarUrl: true } },
}
```

O payload não inclui HTML nem o card completo: `cardId` e `message` são
suficientes para navegar e renderizar o histórico.

```ts
{ items, nextCursor: hasMore ? items[limit - 1].id : null, unreadCount }
```

`notificationVersion` faz `findFirst` mais duas contagens e retorna:

```ts
{
  version: `${latest?.id ?? "none"}-${totalCount}-${unreadCount}`,
  unreadCount,
  totalCount,
  latestId: latest?.id ?? null,
}
```

`setNotificationRead` usa `updateMany({ where: { id, recipientId }, data: { readAt: read ? new Date() : null } })`; lançar `Error("Notificação não encontrada")` quando `count === 0`.

- [ ] **Step 6: Implementar inscrições incrementais**

Adicionar:

```ts
export const listColumnSubscribers = (columnId: string) => db.columnSubscription.findMany({
  where: { columnId }, include: { user: true }, orderBy: { user: { name: "asc" } },
});

export async function subscribeToColumn(columnId: string, userId: string) {
  await validateColumnAndUser(columnId, userId);
  return db.columnSubscription.upsert({
    where: { columnId_userId: { columnId, userId } },
    create: { columnId, userId }, update: {},
  });
}

export async function unsubscribeFromColumn(columnId: string, userId: string) {
  await validateColumnAndUser(columnId, userId);
  await db.columnSubscription.deleteMany({ where: { columnId, userId } });
  return { ok: true };
}
```

`validateColumnAndUser` consulta ambos em paralelo e lança `Error("Coluna não encontrada")` ou `Error("Usuário não encontrado")`.

- [ ] **Step 7: Completar os testes do serviço**

Adicionar casos para:

- `notifyBlockerChange`: add/remove/change e razão isolada sem chamada;
- `notifyCardMoved`: reorder não cria, coluna comum cria para inscritos, `Aguardando Teste` prioriza `CARD_READY_FOR_TEST`;
- paginação `limit + 1` e cursor;
- versão muda com contagem/leitura;
- leitura isolada por `recipientId`;
- subscribe idempotente e unsubscribe idempotente.

Run: `npx vitest run src/server/notifications.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/notifications.ts src/server/notifications.test.ts
git commit -m "feat(TI-258): adiciona dominio de notificacoes"
```

---

### Task 3: Eventos transacionais em cards e MCP

**Files:**
- Modify: `src/server/cards.ts:253-327`
- Modify: `src/server/cards.test.ts`
- Modify: `src/app/api/cards/[id]/route.ts:17-36`
- Create: `src/app/api/cards/[id]/route.test.ts`
- Modify: `src/app/api/cards/[id]/comments/route.ts:7-18`
- Create: `src/app/api/cards/[id]/comments/route.test.ts`
- Modify: `src/mcp/server.ts:81-106,156-188`
- Modify: `src/mcp/server.test.ts`

**Interfaces:**
- Changes: `updateCard(id, input, actor?: string)`.
- Preserves: `moveCard(id, columnRef, position?, actor?: string)`.
- Preserves: `addComment(cardId, body, authorId?, attachmentIds?)`.
- Consumes: emissores da Task 2.

- [ ] **Step 1: Escrever testes que exigem transação e emissão**

No mock de `src/server/cards.test.ts`, adicionar `db.$transaction` que entrega o próprio mock:

```ts
$transaction: vi.fn(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock)),
notification: { createMany: vi.fn() },
columnSubscription: { findMany: vi.fn() },
```

Mockar emissores:

```ts
const notificationMock = vi.hoisted(() => ({
  moved: vi.fn(), blocker: vi.fn(), comment: vi.fn(),
}));
vi.mock("./notifications", () => ({
  notifyCardMoved: notificationMock.moved,
  notifyBlockerChange: notificationMock.blocker,
  notifyComment: notificationMock.comment,
}));
```

Adicionar testes que verificam:

```ts
expect(notificationMock.moved).toHaveBeenCalledWith(
  dbMock, "card1", "u1", "c1", { id: "c2", name: "Aguardando Teste" },
);
expect(notificationMock.blocker).toHaveBeenCalledWith(
  dbMock, "card1", "u1", null, "IMPEDIMENTO",
);
expect(notificationMock.comment).toHaveBeenCalledWith(dbMock, "card1", "u1");
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/server/cards.test.ts`

Expected: FAIL porque as funções ainda não abrem transação nem chamam os emissores.

- [ ] **Step 3: Refatorar `moveCard`**

Resolver `actorId` antes da transação e executar leitura, validação, cálculo de posição, autoatribuição, update e `notifyCardMoved` dentro de:

```ts
return db.$transaction(async (tx) => {
  // current inclui columnId e blocker
  // target inclui id e name
  // update usa tx.card.update
  await notifyCardMoved(tx, id, actorId, current.columnId, target);
  return moved;
});
```

Manter as regras existentes:

- `IMPEDIMENTO` e `AJUSTES` impedem troca de coluna;
- reorder na mesma coluna é permitido;
- ao entrar em coluna cujo nome contém `andamento`, conectar `actorId` como responsável.

- [ ] **Step 4: Refatorar `updateCard`**

Alterar assinatura para:

```ts
export async function updateCard(id: string, input: UpdateCardInput, actor?: string)
```

Resolver `actorId`, executar o update numa transação e carregar `before.blocker`. Chamar `notifyBlockerChange` somente quando `input.blocker !== undefined` e `before.blocker !== input.blocker`. Alterar apenas `blockerReason` não chama o emissor.

- [ ] **Step 5: Refatorar `addComment`**

Executar `comment.create`, vínculo de anexos e `notifyComment(tx, cardId, authorId)` na mesma `db.$transaction`. Preservar retorno `{ id: c.id }`.

- [ ] **Step 6: Corrigir rotas web para passar o autor**

Em `PATCH /api/cards/[id]`, obter `me = await syncCurrentUser()` uma vez, passar `me?.id` para `moveCard` e `updateCard`, e remover o bloco que importa `db` e autoatribui separadamente. A autoatribuição agora pertence a `moveCard`.

Em comentários, manter `author?.id` em `addComment`; o teste deve provar que o id sincronizado é encaminhado.

- [ ] **Step 7: Tornar `actor` consistente no MCP**

Adicionar a `update_card`:

```ts
actor: z.string().optional().describe("Quem executa a alteração — id, nome ou e-mail"),
```

E encaminhar:

```ts
async ({ id, actor, ...rest }) =>
  json(await cards.updateCard(id, rest as cards.UpdateCardInput, actor))
```

Manter `actor` de `move_card` e `add_comment`. Em `src/mcp/server.test.ts`, capturar os mocks `updateCard`, `moveCard` e `addComment` e provar que recebem `"Giovanni"`/id. A lista continua com exatamente 18 tools.

- [ ] **Step 8: Rodar testes focados e suíte**

Run:

```bash
npx vitest run src/server/cards.test.ts 'src/app/api/cards/[id]/route.test.ts' 'src/app/api/cards/[id]/comments/route.test.ts' src/mcp/server.test.ts
npm test
```

Expected: todos passam; nenhuma notificação em reorder ou edição de comentário.

- [ ] **Step 9: Commit**

```bash
git add src/server/cards.ts src/server/cards.test.ts 'src/app/api/cards/[id]' src/mcp/server.ts src/mcp/server.test.ts
git commit -m "feat(TI-258): emite notificacoes nas mutacoes de card"
```

---

### Task 4: APIs da central de notificações

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/route.test.ts`
- Create: `src/app/api/notifications/version/route.ts`
- Create: `src/app/api/notifications/version/route.test.ts`
- Create: `src/app/api/notifications/[id]/route.ts`
- Create: `src/app/api/notifications/[id]/route.test.ts`
- Create: `src/app/api/notifications/read-all/route.ts`
- Create: `src/app/api/notifications/read-all/route.test.ts`

**Interfaces:**
- Produces: `GET /api/notifications?cursor&limit`.
- Produces: `GET /api/notifications/version`.
- Produces: `PATCH /api/notifications/[id] { read: boolean }`.
- Produces: `POST /api/notifications/read-all`.

- [ ] **Step 1: Escrever testes das quatro rotas**

Cada arquivo mocka `requireUser`, `syncCurrentUser` e somente a função de domínio usada. Cobrir:

```ts
it("limita a página a 100", async () => {
  await GET(new Request("http://x/api/notifications?limit=999"));
  expect(listNotifications).toHaveBeenCalledWith("me", { cursor: undefined, limit: 100 });
});

it("rejeita read que não é boolean", async () => {
  const res = await PATCH(new Request("http://x", {
    method: "PATCH", body: JSON.stringify({ read: "sim" }),
  }), { params: Promise.resolve({ id: "n1" }) });
  expect(res.status).toBe(400);
});
```

Também cobrir `401` devolvendo exatamente a resposta de `requireUser`, usuário sincronizado ausente (`401`) e erro `Notificação não encontrada` convertido em `404`.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/app/api/notifications`

Expected: FAIL porque as rotas não existem.

- [ ] **Step 3: Implementar listagem e versão**

Em ambas as rotas:

```ts
const unauth = await requireUser();
if (unauth) return unauth;
const me = await syncCurrentUser();
if (!me) return new Response("Unauthorized", { status: 401 });
```

Na listagem, normalizar o limite:

```ts
const raw = Number(url.searchParams.get("limit") ?? 50);
const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 50));
```

Retornar `NextResponse.json(await listNotifications(me.id, { cursor, limit }))`.

Na versão, exportar `dynamic = "force-dynamic"` e retornar o objeto completo de `notificationVersion(me.id)`.

- [ ] **Step 4: Implementar leitura individual e em lote**

Na rota `[id]`, validar `typeof body.read === "boolean"`; chamar `setNotificationRead(me.id, id, body.read)`. Converter apenas `Notificação não encontrada` em `404`; demais erros sobem para o handler do Next.

Em `read-all`, chamar `markAllNotificationsRead(me.id)` e retornar `{ ok: true }`.

- [ ] **Step 5: Rodar testes**

Run: `npx vitest run src/app/api/notifications`

Expected: PASS para listagem, versão, read/unread, read-all e autenticação.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/notifications
git commit -m "feat(TI-258): adiciona APIs da central de notificacoes"
```

---

### Task 5: APIs incrementais de inscritos por coluna

**Files:**
- Create: `src/app/api/columns/[id]/subscribers/route.ts`
- Create: `src/app/api/columns/[id]/subscribers/route.test.ts`
- Create: `src/app/api/columns/[id]/subscribers/[userId]/route.ts`
- Create: `src/app/api/columns/[id]/subscribers/[userId]/route.test.ts`

**Interfaces:**
- Produces: `GET /api/columns/:id/subscribers`.
- Produces: `POST /api/columns/:id/subscribers/:userId` idempotente.
- Produces: `DELETE /api/columns/:id/subscribers/:userId` idempotente.

- [ ] **Step 1: Escrever testes de autenticação e encaminhamento**

Exemplo do teste de mutação:

```ts
it("adiciona e remove incrementalmente", async () => {
  const ctx = { params: Promise.resolve({ id: "col1", userId: "u1" }) };
  expect((await POST(new Request("http://x", { method: "POST" }), ctx)).status).toBe(201);
  expect(subscribeToColumn).toHaveBeenCalledWith("col1", "u1");
  expect((await DELETE(new Request("http://x", { method: "DELETE" }), ctx)).status).toBe(200);
  expect(unsubscribeFromColumn).toHaveBeenCalledWith("col1", "u1");
});
```

Cobrir `401`, listagem ordenada e conversão das mensagens `Coluna não encontrada`/`Usuário não encontrado` em `404`.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run 'src/app/api/columns/[id]/subscribers'`

Expected: FAIL porque as rotas não existem.

- [ ] **Step 3: Implementar as rotas**

Todas usam `requireUser()`. A listagem transforma relações em payload enxuto:

```ts
const rows = await listColumnSubscribers(id);
return NextResponse.json(rows.map(({ user }) => ({
  id: user.id, name: user.name, avatarUrl: user.avatarUrl,
})));
```

POST retorna `{ ok: true }` com status `201`; DELETE retorna `{ ok: true }` com status `200`.

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run 'src/app/api/columns/[id]/subscribers'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/columns/[id]/subscribers'
git commit -m "feat(TI-258): adiciona APIs de inscritos por coluna"
```

---

### Task 6: Central, polling e alerta sonoro

**Files:**
- Create: `src/components/board/notification-client.ts`
- Create: `src/components/board/notification-client.test.ts`
- Create: `src/components/board/NotificationCenter.tsx`
- Modify: `src/components/board/Chrome.tsx:35-42,67-118`
- Modify: `src/components/board/BoardApp.tsx:118-127`

**Interfaces:**
- Produces: tipos `NotificationItem`, `NotificationPage`, `NotificationVersion`.
- Produces: `notificationBadge`, `newItemsSince`, `shouldPlayNotificationSound`, `playNotificationChime`.
- Produces: `<NotificationCenter openCardId onOpenCard />`.

- [ ] **Step 1: Escrever testes dos helpers de cliente**

Criar `notification-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newItemsSince, notificationBadge, shouldPlayNotificationSound } from "./notification-client";

const item = (id: string, cardId: string) => ({
  id, cardId, type: "COMMENT_ADDED" as const, message: id,
  readAt: null, createdAt: "2026-08-17T12:00:00.000Z", actor: null,
});

it("limita badge em 99+", () => {
  expect(notificationBadge(0)).toBeNull();
  expect(notificationBadge(7)).toBe("7");
  expect(notificationBadge(100)).toBe("99+");
});

it("coleta itens até o último id conhecido", () => {
  expect(newItemsSince([item("n3", "c3"), item("n2", "c2"), item("n1", "c1")], "n1")
    .map((x) => x.id)).toEqual(["n3", "n2"]);
});

it("suprime som só quando todos são do card aberto com foco", () => {
  expect(shouldPlayNotificationSound([item("n2", "c1")], "c1", true)).toBe(false);
  expect(shouldPlayNotificationSound([item("n2", "c1"), item("n3", "c2")], "c1", true)).toBe(true);
  expect(shouldPlayNotificationSound([item("n2", "c1")], "c1", false)).toBe(true);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/components/board/notification-client.test.ts`

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar tipos, fetchers e helpers**

Definir os payloads iguais às APIs e implementar:

```ts
export const notificationBadge = (count: number) => count <= 0 ? null : count > 99 ? "99+" : String(count);

export function newItemsSince(items: NotificationItem[], latestId: string | null) {
  if (!latestId) return items;
  const index = items.findIndex((item) => item.id === latestId);
  return index === -1 ? items : items.slice(0, index);
}

export function shouldPlayNotificationSound(
  items: NotificationItem[], openCardId: string | null, focused: boolean,
) {
  if (!items.length) return false;
  return !(focused && openCardId && items.every((item) => item.cardId === openCardId));
}
```

Adicionar `fetchNotificationPage({ pageParam })`, `fetchNotificationVersion`, `setNotificationRead` e `markAllNotificationsRead`, todos validando `response.ok`.

- [ ] **Step 4: Implementar o toque local via Web Audio API**

```ts
export async function playNotificationChime() {
  const AudioContextCtor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  try {
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.setValueAtTime(880, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
  } catch {
    await context.close().catch(() => undefined);
  }
}
```

- [ ] **Step 5: Implementar `NotificationCenter`**

Usar `useQuery` para `notification-version` com `refetchInterval: 3_000` e `useInfiniteQuery` para `notifications`. Manter `previousVersion` em ref:

```ts
useEffect(() => {
  if (!version) return;
  const previous = previousVersion.current;
  previousVersion.current = version;
  if (!previous) return; // carga inicial nunca toca
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
  if (version.totalCount <= previous.totalCount) return;
  void fetchNotificationPage({ pageParam: undefined }).then((page) => {
    const fresh = newItemsSince(page.items, previous.latestId);
    if (shouldPlayNotificationSound(fresh, openCardId, document.hasFocus())) {
      void playNotificationChime();
    }
  });
}, [version, openCardId, queryClient]);
```

Renderizar `Popover` com:

- botão `variant="ghost" size="icon"` e `<Bell />`;
- badge absoluto com `notificationBadge(version?.unreadCount ?? 0)`;
- cabeçalho `Notificações` + botão `Marcar todas como lidas`;
- itens como buttons de largura total, destaque `bg-accent/50` quando `readAt == null`;
- horário com `Intl.RelativeTimeFormat("pt-BR")`;
- estado vazio `Nenhuma notificação`;
- `Carregar mais` quando `hasNextPage`.

No clique, disparar PATCH, fechar o popover e chamar `onOpenCard(item.cardId)`. Invalidar `notification-version` e `notifications` depois da leitura.

- [ ] **Step 6: Integrar ao cabeçalho e ao card aberto**

Alterar `Chrome` para receber:

```ts
openCardId: string | null;
onOpenCard: (id: string) => void;
```

Montar `<NotificationCenter openCardId={openCardId} onOpenCard={onOpenCard} />` antes de `ThemeToggle`. Em `BoardApp`, passar `openCard` e `setOpenCard`.

- [ ] **Step 7: Rodar verificações focadas**

Run:

```bash
npx vitest run src/components/board/notification-client.test.ts
npx tsc --noEmit
npm run lint
```

Expected: PASS/exit `0`; sem som na carga inicial e sem erro de tipo do Web Audio.

- [ ] **Step 8: Commit**

```bash
git add src/components/board/notification-client.ts src/components/board/notification-client.test.ts src/components/board/NotificationCenter.tsx src/components/board/Chrome.tsx src/components/board/BoardApp.tsx docs/superpowers/specs/2026-08-17-ti-258-notificacoes-board-design.md
git commit -m "feat(TI-258): adiciona central de notificacoes"
```

---

### Task 7: Gestão visual de inscritos por coluna

**Files:**
- Create: `src/components/board/column-subscribers.ts`
- Create: `src/components/board/column-subscribers.test.ts`
- Create: `src/components/board/ColumnSubscribersPopover.tsx`
- Modify: `src/server/cards.ts:85-93`
- Modify: `src/server/cards.test.ts`
- Modify: `src/components/board/BoardApp.tsx:128-137`
- Modify: `src/components/board/Board.tsx:12-25,139-140`
- Modify: `src/components/board/Column.tsx:4-37`

**Interfaces:**
- Produces: `toggleSubscriber(users, user, checked)` para update otimista.
- Produces: `<ColumnSubscribersPopover columnId users initialCount />`.
- Changes: `ColumnData` inclui `_count?: { subscriptions: number }`.

- [ ] **Step 1: Escrever teste do update otimista puro**

```ts
import { describe, expect, it } from "vitest";
import { toggleSubscriber } from "./column-subscribers";

const ana = { id: "u1", name: "Ana", avatarUrl: null };
const bia = { id: "u2", name: "Bia", avatarUrl: null };

it("adiciona sem duplicar e remove por id", () => {
  expect(toggleSubscriber([ana], bia, true)).toEqual([ana, bia]);
  expect(toggleSubscriber([ana], ana, true)).toEqual([ana]);
  expect(toggleSubscriber([ana, bia], ana, false)).toEqual([bia]);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/components/board/column-subscribers.test.ts`

Expected: FAIL porque o helper não existe.

- [ ] **Step 3: Expor contagem no board**

Em `listColumns`, adicionar ao include de cada coluna:

```ts
_count: { select: { subscriptions: true } },
```

Atualizar `ColumnData`:

```ts
export interface ColumnData {
  id: string;
  name: string;
  cards: CardData[];
  _count?: { subscriptions: number };
}
```

Adicionar teste em `cards.test.ts` verificando o include `_count`.

- [ ] **Step 4: Implementar helper e componente**

`toggleSubscriber` mantém ordem por nome após adicionar:

```ts
export function toggleSubscriber(users: Subscriber[], user: Subscriber, checked: boolean) {
  if (!checked) return users.filter((item) => item.id !== user.id);
  if (users.some((item) => item.id === user.id)) return users;
  return [...users, user].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
```

`ColumnSubscribersPopover`:

- busca inscritos somente quando aberto;
- renderiza `Bell` simples e `initialCount` quando maior que zero;
- lista todos os `users` recebidos com avatar, nome e checkbox;
- usa POST ou DELETE incremental;
- em `onMutate`, cancela a query e aplica `toggleSubscriber`;
- em `onError`, restaura snapshot e chama `toast.error("Falha ao atualizar inscritos")`;
- em `onSettled`, invalida `["column-subscribers", columnId]` e `["columns"]`.

- [ ] **Step 5: Repassar usuários até cada coluna**

Adicionar `users` às props de `Board`, repassar em cada `<Column>`, e montar:

```tsx
<ColumnSubscribersPopover
  columnId={column.id}
  users={users}
  initialCount={column._count?.subscriptions ?? 0}
/>
```

O sino fica após a contagem de cards com `ml-auto`, sem deslocar o badge de status.

- [ ] **Step 6: Rodar verificações**

Run:

```bash
npx vitest run src/components/board/column-subscribers.test.ts src/server/cards.test.ts
npx tsc --noEmit
npm run lint
```

Expected: PASS/exit `0`.

- [ ] **Step 7: Commit**

```bash
git add src/components/board/column-subscribers.ts src/components/board/column-subscribers.test.ts src/components/board/ColumnSubscribersPopover.tsx src/components/board/BoardApp.tsx src/components/board/Board.tsx src/components/board/Column.tsx src/server/cards.ts src/server/cards.test.ts
git commit -m "feat(TI-258): adiciona inscritos por coluna"
```

---

### Task 8: Verificação integrada e aceite

**Files:**
- Modify only if a verification failure identifies a concrete defect in files changed by Tasks 1–7.

**Interfaces:**
- Consumes: feature completa.
- Produces: evidência de testes, build e fluxo manual.

- [ ] **Step 1: Aplicar migration local**

Run: `npx prisma migrate dev`

Expected: `20260817190000_ti258_notifications` aplicada via `DIRECT_URL`; nenhuma migration pendente.

- [ ] **Step 2: Rodar suíte completa**

Run: `npm test`

Expected: todos os testes passam, incluindo servidor, rotas, MCP e helpers da UI.

- [ ] **Step 3: Rodar qualidade estática**

Run:

```bash
npx tsc --noEmit
npm run lint
```

Expected: ambos com exit code `0`.

- [ ] **Step 4: Rodar build de produção**

Run: `npm run build`

Expected: migration deploy e build Next terminam com exit code `0`; novas rotas aparecem no output.

- [ ] **Step 5: Validar manualmente com dois usuários**

Run: `npm run dev`

Checklist:

1. Usuário A inscreve B em uma coluna; contador muda sem recarregar a página.
2. A move um card para essa coluna; B recebe uma notificação, A não.
3. A move um card para `Aguardando Teste`; responsável/solicitante B recebe somente uma notificação específica.
4. A comenta e adiciona/remove/troca bloqueio; B recebe cada evento esperado.
5. Abrir a central não marca itens; clicar marca e abre `?card=<id>`.
6. `Marcar todas como lidas` zera o badge sem apagar o histórico.
7. Nenhum som toca na carga inicial; lote novo toca uma vez.
8. Com o card alvo aberto e aba focada, o som não toca; com outro card no lote, toca.
9. Arquivar o card preserva a notificação e o deep-link; excluir definitivamente remove o item.
10. Disparar `move_card`, `add_comment` e `update_card` via MCP com `actor` produz as mesmas regras.

- [ ] **Step 6: Inspecionar o diff final**

Run:

```bash
git diff --check
git status --short
git log --oneline -8
```

Expected: nenhum erro de whitespace; somente arquivos TI-258; commits separados por task.

- [ ] **Step 7: Commit de correções finais, somente se necessário**

Se a verificação exigiu mudanças concretas:

```bash
git add prisma/schema.prisma prisma/migrations/20260817190000_ti258_notifications \
  src/server/notifications.ts src/server/notifications.test.ts src/server/cards.ts src/server/cards.test.ts \
  src/app/api/notifications 'src/app/api/columns/[id]/subscribers' 'src/app/api/cards/[id]' \
  src/mcp/server.ts src/mcp/server.test.ts src/components/board \
  docs/superpowers/specs/2026-08-17-ti-258-notificacoes-board-design.md
git commit -m "fix(TI-258): corrige falhas da verificacao integrada"
```

Se nenhuma mudança foi necessária, não criar commit vazio.
