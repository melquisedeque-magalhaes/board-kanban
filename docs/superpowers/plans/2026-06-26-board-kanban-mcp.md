# Board Kanban + MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Board kanban estilo Notion para o Time de IA, com servidor MCP remoto (token-protected) que compartilha a mesma camada de domínio do front.

**Architecture:** App único Next.js (App Router) servindo UI + REST interno + MCP em `/api/mcp`. Postgres (Docker local / gerenciado em prod) via Prisma. REST e MCP chamam a mesma camada de domínio `src/server/cards.ts` — zero lógica duplicada. Drag-drop com `@dnd-kit` e position float.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL 16 · @dnd-kit · @modelcontextprotocol/sdk · Zod · Vitest

## Global Constraints

- TypeScript strict em todo o código.
- Enum de prioridade exatamente: `ALTA`, `MEDIA`, `BAIXA`.
- `position` é `Float`; reorder calcula média entre vizinhos, pontas usam `±1000`.
- REST e MCP NUNCA duplicam lógica de domínio — ambos chamam `src/server/cards.ts`.
- MCP exige `Authorization: Bearer ${MCP_TOKEN}` — 401 sem isso.
- Resolução de coluna/usuário por nome OU id nas tools MCP.
- Commits frequentes, mensagens em pt-BR, sufixo `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Scaffold Next.js + Postgres + Prisma

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `.env`, `docker-compose.yml`
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx` (placeholder)

**Interfaces:**
- Produces: `prisma` client em `src/lib/db.ts` exportando `db` (PrismaClient singleton); modelos `Board, Column, Card, User, Label, Comment`; enum `Priority`.

- [ ] **Step 1: Scaffold app não-interativo**

```bash
npx --yes create-next-app@latest . --ts --app --src-dir --no-tailwind --eslint --use-npm --import-alias "@/*" --no-turbopack --yes
```

Se o dir não estiver vazio (já tem `docs/`, `.git`), use flag `--yes` e confirme overwrite=No para arquivos existentes; se falhar por dir não-vazio, scaffold em `/tmp/kanban-scaffold` e copie `src/`, `package.json`, `tsconfig.json`, `next.config.ts`, `public/` pra cá.

- [ ] **Step 2: Instalar deps**

```bash
npm i @prisma/client zod @modelcontextprotocol/sdk @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm i -D prisma vitest @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 3: docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: kanban
      POSTGRES_PASSWORD: kanban
      POSTGRES_DB: kanban
    ports:
      - "5432:5432"
    volumes:
      - kanban_pg:/var/lib/postgresql/data
volumes:
  kanban_pg:
```

- [ ] **Step 4: .env.example e .env**

`.env.example`:
```
DATABASE_URL="postgresql://kanban:kanban@localhost:5432/kanban?schema=public"
MCP_TOKEN="troque-este-token"
```
`.env` igual mas com `MCP_TOKEN` real (gerar `openssl rand -hex 24`).

- [ ] **Step 5: prisma/schema.prisma**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Priority { ALTA MEDIA BAIXA }

model Board {
  id String @id @default(cuid())
  name String
  columns Column[]
  createdAt DateTime @default(now())
}
model Column {
  id String @id @default(cuid())
  boardId String
  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  name String
  color String?
  position Float
  cards Card[]
}
model Card {
  id String @id @default(cuid())
  columnId String
  column Column @relation(fields: [columnId], references: [id], onDelete: Cascade)
  code String?
  title String
  description String? @db.Text
  priority Priority?
  position Float
  assignees User[] @relation("CardAssignees")
  labels Label[] @relation("CardLabels")
  comments Comment[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
model User {
  id String @id @default(cuid())
  name String
  email String? @unique
  avatarUrl String?
  cards Card[] @relation("CardAssignees")
  comments Comment[]
}
model Label {
  id String @id @default(cuid())
  name String
  color String
  cards Card[] @relation("CardLabels")
}
model Comment {
  id String @id @default(cuid())
  cardId String
  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  authorId String?
  author User? @relation(fields: [authorId], references: [id])
  body String @db.Text
  createdAt DateTime @default(now())
}
```

- [ ] **Step 6: src/lib/db.ts**

```ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
```

- [ ] **Step 7: Subir DB + migrate**

```bash
docker compose up -d
npx prisma migrate dev --name init
```
Expected: migration aplicada, `prisma/migrations/*/migration.sql` criado.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: scaffold next.js + postgres + prisma schema"
```

---

### Task 2: Camada de position (lib/positions.ts)

**Files:**
- Create: `src/lib/positions.ts`
- Test: `src/lib/positions.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `positionBetween(prev: number | null, next: number | null): number` — posição entre dois vizinhos; `prev=null` → início, `next=null` → fim, ambos null → `1000`.

- [ ] **Step 1: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node" },
});
```
Adicione script em `package.json`: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test — src/lib/positions.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { positionBetween } from "./positions";

describe("positionBetween", () => {
  it("retorna 1000 quando lista vazia", () => {
    expect(positionBetween(null, null)).toBe(1000);
  });
  it("início da lista = primeiro - 1000", () => {
    expect(positionBetween(null, 1000)).toBe(0);
  });
  it("fim da lista = último + 1000", () => {
    expect(positionBetween(1000, null)).toBe(2000);
  });
  it("meio = média dos vizinhos", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
});
```

- [ ] **Step 3: Run test — verify fails**

Run: `npx vitest run src/lib/positions.test.ts`
Expected: FAIL "positionBetween is not a function".

- [ ] **Step 4: Implement — src/lib/positions.ts**

```ts
const STEP = 1000;
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return STEP;
  if (prev == null) return next! - STEP;
  if (next == null) return prev + STEP;
  return (prev + next) / 2;
}
```

- [ ] **Step 5: Run test — verify passes**

Run: `npx vitest run src/lib/positions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: cálculo de position para reorder"
```

---

### Task 3: Camada de domínio (server/cards.ts)

**Files:**
- Create: `src/server/cards.ts`
- Create: `src/server/types.ts`
- Test: `src/server/cards.test.ts`

**Interfaces:**
- Consumes: `db` de `@/lib/db`, `positionBetween` de `@/lib/positions`.
- Produces:
  - `listColumns(): Promise<ColumnWithCards[]>` — colunas ordenadas por position, cada uma com cards ordenados + assignees + labels + `_count.comments`.
  - `listCards(filter: CardFilter): Promise<CardDTO[]>`
  - `getCard(id: string): Promise<CardDetail | null>`
  - `createCard(input: CreateCardInput): Promise<CardDTO>`
  - `updateCard(id: string, input: UpdateCardInput): Promise<CardDTO>`
  - `moveCard(id: string, columnId: string, position?: number): Promise<CardDTO>`
  - `addComment(cardId: string, body: string, authorId?: string): Promise<{ id: string }>`
  - `listUsers()`, `listLabels()`
  - `resolveColumnId(ref: { columnId?: string; columnName?: string }): Promise<string>` — resolve por id ou nome (throw se não achar).
  - `resolveUserIds(refs: string[]): Promise<string[]>` — resolve nomes/ids de users.
  - Tipos em `types.ts`: `Priority` (re-export), `CardFilter`, `CreateCardInput`, `UpdateCardInput`, `CardDTO`, `ColumnWithCards`, `CardDetail`.

- [ ] **Step 1: src/server/types.ts**

```ts
import type { Priority } from "@prisma/client";
export type { Priority };

export interface CardFilter {
  columnId?: string;
  columnName?: string;
  assignee?: string; // nome ou id
  priority?: Priority;
}
export interface CreateCardInput {
  columnId?: string;
  columnName?: string;
  title: string;
  description?: string;
  priority?: Priority;
  code?: string;
  assignees?: string[]; // nomes ou ids
  labels?: string[];    // nomes ou ids
}
export interface UpdateCardInput {
  title?: string;
  description?: string;
  priority?: Priority | null;
  code?: string | null;
  assignees?: string[];
  labels?: string[];
}
```

- [ ] **Step 2: Write failing test — src/server/cards.test.ts**

Mock do Prisma com `vi.mock`. Testa resolução e move. Conteúdo:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = {
  column: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  card: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findMany: vi.fn() },
  label: { findMany: vi.fn() },
  comment: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { resolveColumnId, moveCard } from "./cards";

beforeEach(() => vi.clearAllMocks());

describe("resolveColumnId", () => {
  it("usa columnId direto se válido", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    expect(await resolveColumnId({ columnId: "c1" })).toBe("c1");
  });
  it("resolve por nome", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "c2" });
    expect(await resolveColumnId({ columnName: "Em Andamento" })).toBe("c2");
  });
  it("throw se não achar", async () => {
    dbMock.column.findUnique.mockResolvedValue(null);
    dbMock.column.findFirst.mockResolvedValue(null);
    await expect(resolveColumnId({ columnName: "X" })).rejects.toThrow();
  });
});

describe("moveCard", () => {
  it("calcula position no fim quando omitida", async () => {
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 2000 });
    const r = await moveCard("card1", "c1", undefined);
    expect(dbMock.card.update).toHaveBeenCalled();
    expect(r.position).toBe(2000);
  });
});
```

- [ ] **Step 3: Run test — verify fails**

Run: `npx vitest run src/server/cards.test.ts`
Expected: FAIL (módulo/funcs não existem).

- [ ] **Step 4: Implement — src/server/cards.ts**

```ts
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
  return db.card.update({
    where: { id },
    data: {
      title: input.title, description: input.description,
      priority: input.priority, code: input.code, assignees, labels,
    },
    include: cardInclude,
  });
}

export async function moveCard(id: string, columnIdRef: string, position?: number) {
  const columnId = await resolveColumnId({ columnId: columnIdRef, columnName: columnIdRef });
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
```

Nota: `resolveColumnId` aceita o ref vindo de `moveCard` tanto como id quanto nome (passa os dois campos com o mesmo valor; findUnique por id falha silencioso e cai no findFirst por nome).

- [ ] **Step 5: Run test — verify passes**

Run: `npx vitest run src/server/cards.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: camada de domínio de cards (compartilhada REST+MCP)"
```

---

### Task 4: Seed (board + colunas + dados de exemplo)

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (bloco `prisma.seed`)

**Interfaces:**
- Consumes: modelos Prisma.
- Produces: 1 Board "Board Time de IA", colunas (A Fazer, Em Andamento, Aguardando Teste, Teste, Aguardando Deploy, Done, Concluído, Cancelado), alguns users, labels e cards de exemplo.

- [ ] **Step 1: prisma/seed.ts**

```ts
import { PrismaClient, Priority } from "@prisma/client";
const db = new PrismaClient();

const COLUMNS = [
  "A Fazer", "Em Andamento", "Aguardando Teste", "Teste",
  "Aguardando Deploy", "Done", "Concluído", "Cancelado",
];

async function main() {
  await db.comment.deleteMany();
  await db.card.deleteMany();
  await db.column.deleteMany();
  await db.label.deleteMany();
  await db.user.deleteMany();
  await db.board.deleteMany();

  const board = await db.board.create({ data: { name: "Board Time de IA" } });

  const cols: Record<string, string> = {};
  for (let i = 0; i < COLUMNS.length; i++) {
    const c = await db.column.create({
      data: { boardId: board.id, name: COLUMNS[i], position: (i + 1) * 1000 },
    });
    cols[COLUMNS[i]] = c.id;
  }

  const melqui = await db.user.create({ data: { name: "Melqui Sodré" } });
  const lucas = await db.user.create({ data: { name: "Lucas Vinicius Cardoso" } });

  const alta = await db.label.create({ data: { name: "Alta", color: "#f87171" } });
  const media = await db.label.create({ data: { name: "Média", color: "#fbbf24" } });

  await db.card.create({
    data: {
      columnId: cols["A Fazer"], title: "Implementar Tool Search",
      priority: Priority.ALTA, position: 1000,
      assignees: { connect: [{ id: melqui.id }] }, labels: { connect: [{ id: alta.id }] },
    },
  });
  await db.card.create({
    data: {
      columnId: cols["Em Andamento"], code: "TI-2", title: "DS Gol Web",
      priority: Priority.ALTA, position: 1000,
      assignees: { connect: [{ id: lucas.id }] }, labels: { connect: [{ id: alta.id }] },
    },
  });
  await db.card.create({
    data: {
      columnId: cols["Aguardando Teste"], code: "TI-13", title: "MCP do Falcon",
      priority: Priority.MEDIA, position: 1000,
      assignees: { connect: [{ id: melqui.id }] }, labels: { connect: [{ id: media.id }] },
    },
  });

  console.log("seed ok");
}
main().finally(() => db.$disconnect());
```

- [ ] **Step 2: package.json — bloco prisma + dep**

Adicione ao `package.json`:
```json
"prisma": { "seed": "node --experimental-strip-types prisma/seed.ts" }
```
(Node 24 roda TS direto com `--experimental-strip-types`.)

- [ ] **Step 3: Rodar seed**

Run: `npx prisma db seed`
Expected: stdout "seed ok", sem erro.

- [ ] **Step 4: Verificar no DB**

Run: `npx prisma studio` não (interativo) — em vez disso:
```bash
docker compose exec -T db psql -U kanban -d kanban -c "select name from \"Column\" order by position;"
```
Expected: 8 colunas na ordem.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: seed do board com colunas e cards de exemplo"
```

---

### Task 5: REST API (columns + cards CRUD/move)

**Files:**
- Create: `src/app/api/columns/route.ts`
- Create: `src/app/api/cards/route.ts`
- Create: `src/app/api/cards/[id]/route.ts`
- Test: `src/app/api/cards/route.test.ts`

**Interfaces:**
- Consumes: funções de `@/server/cards`.
- Produces:
  - `GET /api/columns` → `listColumns()`
  - `GET /api/cards?columnId&assignee&priority` → `listCards()`
  - `POST /api/cards` body `CreateCardInput` → `createCard()`
  - `PATCH /api/cards/[id]` body `{ columnId?, position?, ...UpdateCardInput }` → `moveCard` (se columnId/position presentes) e/ou `updateCard`
  - `DELETE /api/cards/[id]` → remove card

- [ ] **Step 1: Write failing test — src/app/api/cards/route.test.ts**

```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/server/cards", () => ({
  listCards: vi.fn().mockResolvedValue([{ id: "x", title: "t" }]),
  createCard: vi.fn().mockResolvedValue({ id: "new", title: "novo" }),
}));
import { GET, POST } from "./route";

describe("GET /api/cards", () => {
  it("retorna cards", async () => {
    const res = await GET(new Request("http://x/api/cards"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "x", title: "t" }]);
  });
});
describe("POST /api/cards", () => {
  it("cria card", async () => {
    const res = await POST(new Request("http://x/api/cards", {
      method: "POST", body: JSON.stringify({ columnName: "A Fazer", title: "novo" }),
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "new" });
  });
});
```

- [ ] **Step 2: Run — verify fails**

Run: `npx vitest run src/app/api/cards/route.test.ts`
Expected: FAIL (route não existe).

- [ ] **Step 3: Implement — src/app/api/columns/route.ts**

```ts
import { NextResponse } from "next/server";
import { listColumns } from "@/server/cards";
export async function GET() {
  return NextResponse.json(await listColumns());
}
```

- [ ] **Step 4: Implement — src/app/api/cards/route.ts**

```ts
import { NextResponse } from "next/server";
import { listCards, createCard } from "@/server/cards";
import type { Priority } from "@prisma/client";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cards = await listCards({
    columnId: sp.get("columnId") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    priority: (sp.get("priority") as Priority) ?? undefined,
  });
  return NextResponse.json(cards);
}

export async function POST(req: Request) {
  const body = await req.json();
  const card = await createCard(body);
  return NextResponse.json(card, { status: 201 });
}
```

- [ ] **Step 5: Implement — src/app/api/cards/[id]/route.ts**

```ts
import { NextResponse } from "next/server";
import { updateCard, moveCard, getCard } from "@/server/cards";
import { db } from "@/lib/db";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.columnId !== undefined || body.position !== undefined) {
    await moveCard(id, body.columnId, body.position);
  }
  const hasFields = ["title", "description", "priority", "code", "assignees", "labels"]
    .some((k) => k in body);
  if (hasFields) await updateCard(id, body);
  return NextResponse.json(await getCard(id));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.card.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run — verify passes**

Run: `npx vitest run src/app/api/cards/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: REST api de columns e cards"
```

---

### Task 6: MCP server (tools sobre a camada de domínio)

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/app/api/mcp/route.ts`
- Test: `src/mcp/server.test.ts`

**Interfaces:**
- Consumes: funções de `@/server/cards`.
- Produces: `buildMcpServer(): McpServer` com tools `list_columns, list_cards, get_card, create_card, update_card, move_card, add_comment, list_users, list_labels`. Handler HTTP em `/api/mcp` que valida Bearer token e delega ao transport.

- [ ] **Step 1: src/mcp/server.ts**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as cards from "@/server/cards";
import type { Priority } from "@prisma/client";

const priority = z.enum(["ALTA", "MEDIA", "BAIXA"]);
const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function buildMcpServer() {
  const s = new McpServer({ name: "board-kanban", version: "1.0.0" });

  s.tool("list_columns", "Lista colunas do board com seus cards", {}, async () =>
    json(await cards.listColumns()));

  s.tool("list_cards", "Lista cards filtrando por coluna, assignee ou prioridade", {
    columnId: z.string().optional(),
    columnName: z.string().optional(),
    assignee: z.string().optional(),
    priority: priority.optional(),
  }, async (a) => json(await cards.listCards(a as cards.CardFilter)));

  s.tool("get_card", "Detalhe de um card com comentários", {
    id: z.string(),
  }, async ({ id }) => json(await cards.getCard(id)));

  s.tool("create_card", "Cria um card numa coluna", {
    columnId: z.string().optional(),
    columnName: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    priority: priority.optional(),
    code: z.string().optional(),
    assignees: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
  }, async (a) => json(await cards.createCard(a as cards.CreateCardInput)));

  s.tool("update_card", "Atualiza campos de um card", {
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    priority: priority.optional(),
    code: z.string().optional(),
    assignees: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
  }, async ({ id, ...rest }) => json(await cards.updateCard(id, rest as cards.UpdateCardInput)));

  s.tool("move_card", "Move um card para outra coluna/posição", {
    id: z.string(),
    columnId: z.string().optional(),
    columnName: z.string().optional(),
    position: z.number().optional(),
  }, async ({ id, columnId, columnName, position }) =>
    json(await cards.moveCard(id, (columnId ?? columnName)!, position)));

  s.tool("add_comment", "Adiciona comentário a um card", {
    cardId: z.string(),
    body: z.string(),
    actor: z.string().optional(),
  }, async ({ cardId, body, actor }) => {
    const ids = actor ? await cards.resolveUserIds([actor]) : [];
    return json(await cards.addComment(cardId, body, ids[0]));
  });

  s.tool("list_users", "Lista usuários", {}, async () => json(await cards.listUsers()));
  s.tool("list_labels", "Lista labels", {}, async () => json(await cards.listLabels()));

  return s;
}
```

Nota: importe os tipos `CardFilter/CreateCardInput/UpdateCardInput` re-exportando-os de `@/server/cards` (adicione `export type { CardFilter, CreateCardInput, UpdateCardInput } from "./types";` no fim de `src/server/cards.ts`).

- [ ] **Step 2: Adicionar re-export em src/server/cards.ts**

No fim do arquivo:
```ts
export type { CardFilter, CreateCardInput, UpdateCardInput } from "./types";
```

- [ ] **Step 3: src/app/api/mcp/route.ts**

```ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "@/mcp/server";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return !!process.env.MCP_TOKEN && token === process.env.MCP_TOKEN;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildMcpServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
```

Se a versão do SDK expuser uma assinatura diferente de `handleRequest` (Node `req/res` em vez de Web `Request`), adapte usando o helper Web do SDK; verifique a doc do `@modelcontextprotocol/sdk` instalado via context7 antes de implementar.

- [ ] **Step 4: Write test — src/mcp/server.test.ts**

```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/server/cards", () => ({
  listColumns: vi.fn().mockResolvedValue([{ id: "c1", name: "A Fazer" }]),
  listCards: vi.fn(), getCard: vi.fn(), createCard: vi.fn(),
  updateCard: vi.fn(), moveCard: vi.fn(), addComment: vi.fn(),
  listUsers: vi.fn(), listLabels: vi.fn(), resolveUserIds: vi.fn(),
}));
import { buildMcpServer } from "./server";

describe("buildMcpServer", () => {
  it("registra as tools sem throw", () => {
    const s = buildMcpServer();
    expect(s).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run — verify passes**

Run: `npx vitest run src/mcp/server.test.ts`
Expected: PASS.

- [ ] **Step 6: Smoke test do endpoint MCP**

```bash
npm run dev &
sleep 4
curl -s -X POST http://localhost:3000/api/mcp -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 300
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/mcp \
  -H "content-type: application/json" -d '{}'   # sem token -> 401
```
Expected: 1ª chamada sem token → 401; com `-H "authorization: Bearer $MCP_TOKEN"` → lista de tools.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: servidor MCP remoto com tools de board (token-protected)"
```

---

### Task 7: UI do board (drag-drop)

**Files:**
- Create: `src/app/page.tsx` (server: fetch colunas)
- Create: `src/components/board/Board.tsx` (client: DndContext)
- Create: `src/components/board/Column.tsx`
- Create: `src/components/board/Card.tsx`
- Create: `src/components/board/board.module.css`
- Create: `src/app/globals.css` (se não existir do scaffold)

**Interfaces:**
- Consumes: `listColumns()` no server component; `PATCH /api/cards/[id]` no client.
- Produces: board interativo renderizando colunas e cards, drag-drop persistente.

- [ ] **Step 1: src/app/page.tsx**

```tsx
import { listColumns } from "@/server/cards";
import { Board } from "@/components/board/Board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const columns = await listColumns();
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Board Time de IA</h1>
      <p style={{ color: "#6b7280", marginBottom: 20 }}>Kanban de tarefas do time de IA</p>
      <Board initialColumns={JSON.parse(JSON.stringify(columns))} />
    </main>
  );
}
```

- [ ] **Step 2: src/components/board/Card.tsx**

```tsx
"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "./board.module.css";

export interface CardData {
  id: string; code?: string | null; title: string;
  priority?: "ALTA" | "MEDIA" | "BAIXA" | null;
  assignees: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  _count: { comments: number };
}

const prLabel = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

export function Card({ card }: { card: CardData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Translate.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={styles.card}>
      <div className={styles.cardTitle}>
        {card.code ? <span className={styles.code}>{card.code} · </span> : null}
        {card.title}
      </div>
      <div className={styles.cardMeta}>
        {card.assignees.map((a) => (
          <span key={a.id} className={styles.avatar} title={a.name}>
            {a.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
        ))}
        {card.priority ? <span className={styles.priority}>{prLabel[card.priority]}</span> : null}
        {card._count.comments > 0 ? <span className={styles.comments}>💬 {card._count.comments}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: src/components/board/Column.tsx**

```tsx
"use client";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Card, type CardData } from "./Card";
import styles from "./board.module.css";

export interface ColumnData { id: string; name: string; cards: CardData[]; }

export function Column({ column }: { column: ColumnData }) {
  const { setNodeRef } = useDroppable({ id: column.id });
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>{column.name}</div>
      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={styles.cardList}>
          {column.cards.map((c) => <Card key={c.id} card={c} />)}
        </div>
      </SortableContext>
    </div>
  );
}
```

- [ ] **Step 4: src/components/board/Board.tsx**

```tsx
"use client";
import { useState } from "react";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { Column, type ColumnData } from "./Column";
import styles from "./board.module.css";

function findCard(cols: ColumnData[], id: string) {
  for (const c of cols) { const card = c.cards.find((x) => x.id === id); if (card) return { col: c, card }; }
  return null;
}

export function Board({ initialColumns }: { initialColumns: ColumnData[] }) {
  const [columns, setColumns] = useState<ColumnData[]>(initialColumns);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findCard(columns, String(active.id));
    if (!from) return;
    const overCol = columns.find((c) => c.id === over.id)
      ?? findCard(columns, String(over.id))?.col;
    if (!overCol) return;

    const prev = columns;
    // novo estado otimista
    const next = columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== active.id) }));
    const target = next.find((c) => c.id === overCol.id)!;
    const overIdx = target.cards.findIndex((x) => x.id === over.id);
    const insertAt = overIdx === -1 ? target.cards.length : overIdx;
    target.cards.splice(insertAt, 0, from.card);
    setColumns(next);

    // position no cliente: meio dos vizinhos
    const before = target.cards[insertAt - 1]?.id;
    const after = target.cards[insertAt + 1]?.id;
    const posOf = (id?: string) => prev.flatMap((c) => c.cards).find((x) => x.id === id);
    const p = (posOf(before) as any)?.position ?? null;
    const n = (posOf(after) as any)?.position ?? null;
    const position = p == null && n == null ? 1000 : p == null ? n - 1000 : n == null ? p + 1000 : (p + n) / 2;

    const res = await fetch(`/api/cards/${active.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId: overCol.id, position }),
    });
    if (!res.ok) setColumns(prev); // rollback
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className={styles.board}>
        {columns.map((c) => <Column key={c.id} column={c} />)}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 5: src/components/board/board.module.css**

```css
.board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 16px; align-items: flex-start; }
.column { background: #f7f7f5; border-radius: 10px; padding: 8px; min-width: 280px; max-width: 280px; }
.columnHeader { font-weight: 600; font-size: 14px; padding: 6px 8px; color: #37352f; }
.cardList { display: flex; flex-direction: column; gap: 8px; min-height: 24px; }
.card { background: #fff; border: 1px solid #ebebea; border-radius: 8px; padding: 10px 12px; box-shadow: 0 1px 2px rgba(0,0,0,.04); cursor: grab; }
.cardTitle { font-size: 14px; color: #37352f; line-height: 1.4; }
.code { color: #6b7280; font-weight: 500; }
.cardMeta { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.avatar { width: 20px; height: 20px; border-radius: 999px; background: #e0e7ff; color: #3730a3; font-size: 10px; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; }
.priority { font-size: 11px; background: #fee2e2; color: #b91c1c; padding: 1px 8px; border-radius: 4px; }
.comments { font-size: 11px; color: #6b7280; }
```

- [ ] **Step 6: Rodar e validar visual**

```bash
docker compose up -d
npm run dev
```
Abrir `http://localhost:3000`. Expected: board com 8 colunas, cards do seed, arrastar card entre colunas e dar reload → posição persiste.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: UI do board com drag-drop (dnd-kit)"
```

---

### Task 8: Criar/editar card pela UI (modal)

**Files:**
- Create: `src/components/board/CardDialog.tsx`
- Modify: `src/components/board/Board.tsx` (botão "+ New" por coluna, abrir modal)
- Modify: `src/components/board/Column.tsx` (slot do botão add)

**Interfaces:**
- Consumes: `POST /api/cards`, `GET /api/columns` (refetch após criar).
- Produces: modal com título, descrição, prioridade, coluna; cria via REST e atualiza board.

- [ ] **Step 1: src/components/board/CardDialog.tsx**

```tsx
"use client";
import { useState } from "react";
import styles from "./board.module.css";

export function CardDialog({ columnId, onClose, onCreated }: {
  columnId: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await fetch("/api/cards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId, title, priority: priority || undefined }),
    });
    setSaving(false); onCreated(); onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Novo card</h3>
        <input autoFocus className={styles.input} placeholder="Título"
          value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Sem prioridade</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose}>Cancelar</button>
          <button onClick={save} disabled={saving}>Criar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: CSS do modal — append em board.module.css**

```css
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: #fff; border-radius: 10px; padding: 20px; width: 360px; }
.input { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 10px; font-size: 14px; }
.addBtn { width: 100%; text-align: left; color: #9ca3af; font-size: 13px; padding: 6px 8px; background: none; border: none; cursor: pointer; }
.addBtn:hover { color: #374151; }
```

- [ ] **Step 3: Column.tsx — slot do botão add via prop**

Adicione prop `onAdd` e renderize botão no fim:
```tsx
// na assinatura:
export function Column({ column, onAdd }: { column: ColumnData; onAdd: (columnId: string) => void; }) {
// ...após o cardList, antes de fechar a div externa:
      <button className={styles.addBtn} onClick={() => onAdd(column.id)}>+ New page</button>
```

- [ ] **Step 4: Board.tsx — estado do modal + refetch**

Adicione no componente `Board`:
```tsx
import { CardDialog } from "./CardDialog";
// dentro de Board, novos states:
const [addTo, setAddTo] = useState<string | null>(null);
async function refetch() {
  const r = await fetch("/api/columns"); setColumns(await r.json());
}
// passe onAdd ao Column:
<Column key={c.id} column={c} onAdd={setAddTo} />
// antes de fechar o DndContext:
{addTo && <CardDialog columnId={addTo} onClose={() => setAddTo(null)} onCreated={refetch} />}
```

- [ ] **Step 5: Validar**

Run: `npm run dev`, abrir board, clicar "+ New page" numa coluna, criar card → aparece sem reload.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: criar card pela UI (modal)"
```

---

### Task 9: README + finalização

**Files:**
- Create: `README.md`
- Modify: `package.json` (scripts utilitários)

**Interfaces:** —

- [ ] **Step 1: README.md**

Documente: setup local (`docker compose up -d`, `prisma migrate dev`, `prisma db seed`, `npm run dev`), variáveis de ambiente, como conectar um cliente MCP (URL `https://<deploy>/api/mcp`, header `Authorization: Bearer <MCP_TOKEN>`, lista de tools), e deploy na Vercel (setar `DATABASE_URL` do Postgres gerenciado + `MCP_TOKEN`).

Inclua bloco de config MCP exemplo:
```json
{
  "mcpServers": {
    "board-kanban": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer SEU_MCP_TOKEN" }
    }
  }
}
```

- [ ] **Step 2: Scripts em package.json**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "db:up": "docker compose up -d",
  "db:seed": "prisma db seed",
  "db:migrate": "prisma migrate dev"
}
```

- [ ] **Step 3: Rodar suíte completa**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: README com setup, MCP e deploy"
```

---

## Self-Review

**Spec coverage:**
- Arquitetura monorepo Next.js → Task 1, 5, 6, 7 ✓
- Modelo de dados Prisma → Task 1 ✓
- position/reorder → Task 2 ✓
- Camada de domínio compartilhada → Task 3 (REST e MCP consomem em 5/6) ✓
- Seed → Task 4 ✓
- REST CRUD/move → Task 5 ✓
- MCP token-protected + tools → Task 6 ✓
- Drag-drop UI → Task 7 ✓
- Criar/editar card UI → Task 8 ✓
- Auth web aberto / MCP Bearer → Task 6 ✓
- Docker + envs → Task 1 ✓
- Testes Vitest (positions, domínio, MCP, REST) → Tasks 2,3,5,6 ✓
- README/deploy → Task 9 ✓

**Fora de escopo respeitado:** página do card, múltiplos boards na UI, login real, realtime — nenhum aparece nas tasks ✓

**Type consistency:** `Priority` enum `ALTA|MEDIA|BAIXA` consistente em schema, types, MCP zod, UI. `CardFilter/CreateCardInput/UpdateCardInput` definidos em Task 3, re-exportados e usados em 5/6. `positionBetween` assinatura única. `listColumns` retorno usado em page.tsx e REST. ✓

**Placeholder scan:** sem TBD/TODO; todo step de código tem código real. A única instrução condicional (adaptar `handleRequest` do SDK MCP) aponta pra verificação via context7 — aceitável pois depende da versão instalada do SDK.
