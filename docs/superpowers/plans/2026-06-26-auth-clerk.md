# Auth com Clerk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar login via Clerk (magic link + Google) ao board-kanban; board e REST atrás do login; `/api/mcp` segue Bearer-only; usuário Clerk sincronizado na tabela `User`.

**Architecture:** `@clerk/nextjs` com `<ClerkProvider>` no layout e `clerkMiddleware` protegendo tudo exceto `/sign-in`, `/sign-up` e `/api/mcp`. Sync lazy do usuário Clerk → tabela `User` (campo novo `clerkId`) no carregamento do board. REST com early-401 como defesa em profundidade.

**Tech Stack:** Next.js 16 (App Router) · @clerk/nextjs · Prisma 7 · Vitest

## Global Constraints

- TypeScript strict.
- `/api/mcp` NUNCA fica atrás do Clerk — é rota pública no middleware; o gate `MCP_TOKEN` (Bearer) é a auth dos agentes.
- Clerk é mockado em TODOS os testes (`@clerk/nextjs/server`); nunca subir Clerk real em teste.
- Métodos de login (magic link + Google) são configurados no dashboard do Clerk, não em código.
- Commits em pt-BR + trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch de trabalho: `feat/auth-clerk`.

---

### Task 1: Instalar Clerk + ClerkProvider + env

**Files:**
- Modify: `package.json` (dep `@clerk/nextjs`)
- Modify: `src/app/layout.tsx`
- Modify: `.env.example`, `.env`

**Interfaces:**
- Produces: app envolto em `<ClerkProvider>`; env `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

- [ ] **Step 1: Instalar**

```bash
npm i @clerk/nextjs
```

- [ ] **Step 2: Env**

Append em `.env.example`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_xxx"
CLERK_SECRET_KEY="sk_test_xxx"
```
Em `.env` colocar as chaves reais do dashboard Clerk (o usuário fornece; se ausentes, deixar os placeholders — o build não quebra, só o runtime de auth exige).

- [ ] **Step 3: Envolver layout — src/app/layout.tsx**

Ler o arquivo atual e envolver o conteúdo retornado com `<ClerkProvider>`. Resultado:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Board Time de IA",
  description: "Kanban de tarefas do time de IA",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="pt-BR" className={inter.variable}>
        <body style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Verificar build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → sucesso (o ClerkProvider sem chaves não quebra o build; só páginas que usam auth em runtime exigem chave).
Nota: se o build exigir chave, exportar `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` placeholder no ambiente do build.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(auth): instala Clerk e envolve app no ClerkProvider"
```

---

### Task 2: Middleware Clerk (protege tudo exceto mcp + sign-in)

**Files:**
- Create: `src/middleware.ts`
- Test: `src/middleware.test.ts`

**Interfaces:**
- Produces: `isPublicRoute(path: string): boolean` exportado de `src/middleware.ts` — testável; retorna true para `/sign-in*`, `/sign-up*`, `/api/mcp*`.
- Produces: middleware default que protege rotas não-públicas.

- [ ] **Step 1: Write failing test — src/middleware.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { isPublicRoute } from "./middleware";

describe("isPublicRoute", () => {
  it("/api/mcp é público (agentes usam Bearer, não Clerk)", () => {
    expect(isPublicRoute("/api/mcp")).toBe(true);
  });
  it("/sign-in é público", () => {
    expect(isPublicRoute("/sign-in")).toBe(true);
    expect(isPublicRoute("/sign-in/factor-one")).toBe(true);
  });
  it("/sign-up é público", () => {
    expect(isPublicRoute("/sign-up")).toBe(true);
  });
  it("board é protegido", () => {
    expect(isPublicRoute("/")).toBe(false);
  });
  it("/api/cards é protegido", () => {
    expect(isPublicRoute("/api/cards")).toBe(false);
  });
  it("/api/columns é protegido", () => {
    expect(isPublicRoute("/api/columns")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fails**

Run: `npx vitest run src/middleware.test.ts`
Expected: FAIL (isPublicRoute não existe).

- [ ] **Step 3: Implement — src/middleware.ts**

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const PUBLIC_PATTERNS = ["/sign-in(.*)", "/sign-up(.*)", "/api/mcp(.*)"];

// Exportado para teste — espelha exatamente os padrões públicos.
export function isPublicRoute(path: string): boolean {
  return PUBLIC_PATTERNS.some((p) => {
    const re = new RegExp("^" + p.replace(/\(\.\*\)/g, ".*") + "$");
    return re.test(path);
  });
}

const matcher = createRouteMatcher(PUBLIC_PATTERNS);

export default clerkMiddleware(async (auth, req) => {
  if (!matcher(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 4: Run — verify passes**

Run: `npx vitest run src/middleware.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(auth): middleware Clerk protege board e REST, mcp público"
```

---

### Task 3: Páginas de sign-in / sign-up

**Files:**
- Create: `src/app/sign-in/[[...rest]]/page.tsx`
- Create: `src/app/sign-up/[[...rest]]/page.tsx`

**Interfaces:**
- Consumes: `<SignIn>`, `<SignUp>` de `@clerk/nextjs`.
- Produces: rotas `/sign-in` e `/sign-up` renderizando os componentes Clerk (magic link + Google vêm do dashboard).

- [ ] **Step 1: src/app/sign-in/[[...rest]]/page.tsx**

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 2: src/app/sign-up/[[...rest]]/page.tsx**

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → sucesso, rotas `/sign-in/[[...rest]]` e `/sign-up/[[...rest]]` aparecem no output.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(auth): páginas de sign-in e sign-up do Clerk"
```

---

### Task 4: Campo clerkId + sync de usuário

**Files:**
- Modify: `prisma/schema.prisma` (User.clerkId)
- Create: `src/server/users.ts`
- Test: `src/server/users.test.ts`
- Migration: `prisma/migrations/*_add_clerk_id`

**Interfaces:**
- Consumes: `db` de `@/lib/db`; `currentUser` de `@clerk/nextjs/server`.
- Produces: `syncCurrentUser(): Promise<{ id: string } | null>` — upsert do usuário Clerk logado na tabela `User` por `clerkId`; retorna o User do board, ou `null` se não houver usuário logado.

- [ ] **Step 1: Schema — adicionar clerkId em User**

Em `prisma/schema.prisma`, no model `User`, adicionar após `id`:
```prisma
  clerkId String? @unique
```

- [ ] **Step 2: Migration**

```bash
docker compose up -d
npx prisma migrate dev --name add_clerk_id
```
Expected: migration criada e aplicada; `clerkId` na tabela `User`.

- [ ] **Step 3: Write failing test — src/server/users.test.ts**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = { user: { upsert: vi.fn() } };
vi.mock("@/lib/db", () => ({ db: dbMock }));
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ currentUser: () => currentUserMock() }));

import { syncCurrentUser } from "./users";

beforeEach(() => vi.clearAllMocks());

describe("syncCurrentUser", () => {
  it("retorna null se não há usuário logado", async () => {
    currentUserMock.mockResolvedValue(null);
    expect(await syncCurrentUser()).toBeNull();
    expect(dbMock.user.upsert).not.toHaveBeenCalled();
  });

  it("faz upsert por clerkId com nome/email/avatar", async () => {
    currentUserMock.mockResolvedValue({
      id: "clerk_123",
      firstName: "Melqui",
      lastName: "Sodré",
      imageUrl: "http://img/a.png",
      primaryEmailAddress: { emailAddress: "m@brq.com" },
    });
    dbMock.user.upsert.mockResolvedValue({ id: "u1" });
    const r = await syncCurrentUser();
    expect(r).toEqual({ id: "u1" });
    const arg = dbMock.user.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ clerkId: "clerk_123" });
    expect(arg.create).toMatchObject({ clerkId: "clerk_123", name: "Melqui Sodré", email: "m@brq.com", avatarUrl: "http://img/a.png" });
    expect(arg.update).toMatchObject({ name: "Melqui Sodré", email: "m@brq.com", avatarUrl: "http://img/a.png" });
  });
});
```

- [ ] **Step 4: Run — verify fails**

Run: `npx vitest run src/server/users.test.ts`
Expected: FAIL (syncCurrentUser não existe).

- [ ] **Step 5: Implement — src/server/users.ts**

```ts
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function syncCurrentUser(): Promise<{ id: string } | null> {
  const u = await currentUser();
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.id;
  const email = u.primaryEmailAddress?.emailAddress;
  const avatarUrl = u.imageUrl;
  const saved = await db.user.upsert({
    where: { clerkId: u.id },
    create: { clerkId: u.id, name, email, avatarUrl },
    update: { name, email, avatarUrl },
    select: { id: true },
  });
  return saved;
}
```

- [ ] **Step 6: Run — verify passes**

Run: `npx vitest run src/server/users.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(auth): clerkId no User + syncCurrentUser (sync lazy Clerk->User)"
```

---

### Task 5: REST early-401 + chamar sync na página

**Files:**
- Modify: `src/app/api/cards/route.ts`
- Modify: `src/app/api/cards/[id]/route.ts`
- Modify: `src/app/api/columns/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/api/cards/route.test.ts` (mock do `auth`)

**Interfaces:**
- Consumes: `auth` de `@clerk/nextjs/server`; `syncCurrentUser` de `@/server/users`.
- Produces: rotas REST retornam 401 sem `userId`; board chama `syncCurrentUser()` no load.

- [ ] **Step 1: Helper de guard inline nas rotas REST**

Em cada uma das 3 rotas REST, no topo de cada handler exportado (GET/POST/PATCH/DELETE), adicionar:
```ts
import { auth } from "@clerk/nextjs/server";
// no início do handler:
const { userId } = await auth();
if (!userId) return new Response("Unauthorized", { status: 401 });
```
Aplicar em: `columns/route.ts` (GET), `cards/route.ts` (GET, POST), `cards/[id]/route.ts` (PATCH, DELETE). NÃO tocar em `mcp/route.ts`.

- [ ] **Step 2: Atualizar teste REST existente — src/app/api/cards/route.test.ts**

Adicionar mock do Clerk no topo (antes dos imports da rota):
```ts
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: "clerk_test" }) }));
```
Os testes existentes (GET retorna cards, POST 201) seguem passando porque `auth()` mockado retorna `userId`.

- [ ] **Step 3: page.tsx chama syncCurrentUser**

Em `src/app/page.tsx`, antes de `listColumns()`:
```tsx
import { syncCurrentUser } from "@/server/users";
// dentro do Home(), primeira linha:
await syncCurrentUser();
```

- [ ] **Step 4: Run — todos os testes**

Run: `npx vitest run`
Expected: PASS (todos — REST com auth mockado, novos de middleware/users, e os antigos).
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(auth): early-401 nas rotas REST + sync do usuário no load do board"
```

---

### Task 6: UserButton na top bar

**Files:**
- Modify: `src/components/board/Chrome.tsx`
- Modify: `src/components/board/chrome.module.css` (se necessário)

**Interfaces:**
- Consumes: `<UserButton>` de `@clerk/nextjs`.
- Produces: top bar mostra o `<UserButton>` (logout/perfil) no lugar dos avatares fake.

- [ ] **Step 1: Trocar avatares fake pelo UserButton — Chrome.tsx**

Ler `Chrome.tsx`. No bloco `topRight`, remover o `avatarStack` fake e o `more` `+3`, e adicionar antes do botão Share (ou no lugar do stack):
```tsx
import { UserButton } from "@clerk/nextjs";
// no topRight, onde estavam os avatares:
<UserButton afterSignOutUrl="/sign-in" />
```
Manter "Edited just now" e o botão Share. `Chrome` continua server component? `<UserButton>` é client — se der erro de server/client, marcar o Chrome com `"use client"` no topo OU extrair só o UserButton num pequeno componente client. Preferir extrair: criar inline um wrapper `"use client"` se necessário. Verificar no build.

- [ ] **Step 2: Verificar build + visual**

Run: `npx tsc --noEmit` → exit 0.
Run: `npm run build` → sucesso.
(O controlador faz o check visual no browser com um usuário logado.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(auth): UserButton do Clerk na top bar"
```

---

### Task 7: README + env Vercel (docs)

**Files:**
- Modify: `README.md`

**Interfaces:** —

- [ ] **Step 1: Documentar auth no README**

Adicionar seção "Autenticação (Clerk)":
- Criar app no dashboard Clerk; habilitar Email magic link + Google.
- Env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (local em `.env`, e na Vercel).
- Board e REST exigem login; `/api/mcp` continua Bearer-only (agentes não logam).
- URLs de sign-in: `/sign-in`, `/sign-up`.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: seção de autenticação Clerk no README"
```

---

## Self-Review

**Spec coverage:**
- ClerkProvider + env → Task 1 ✓
- Middleware (público: mcp, sign-in, sign-up; protege resto) → Task 2 ✓
- Sign-in/sign-up pages → Task 3 ✓
- clerkId + syncCurrentUser → Task 4 ✓
- REST early-401 + sync no load → Task 5 ✓
- UserButton na UI → Task 6 ✓
- Env Vercel + docs → Task 7 ✓
- MCP fora do Clerk → Task 2 (rota pública) + Task 5 (não toca mcp/route.ts) ✓
- Testes: middleware, syncCurrentUser, REST com auth mockado → Tasks 2,4,5 ✓

**Fora de escopo respeitado:** roles/RBAC, webhook, orgs, proteger mcp por sessão — nenhum aparece nas tasks ✓

**Type consistency:** `syncCurrentUser(): Promise<{id:string}|null>` definido na Task 4, usado na Task 5. `isPublicRoute(path)` Task 2. `auth()` retorna `{userId}` usado consistente nas Tasks 5. `clerkId String? @unique` no schema (Task 4) bate com `where:{clerkId}` no upsert. ✓

**Placeholder scan:** sem TBD/TODO; todo step de código tem código real. Os pontos condicionais (chave Clerk no build; UserButton client/server) têm instrução concreta de verificação no build. ✓
