# Auth com Clerk (magic link + Google) — Design

**Data:** 2026-06-26
**Autor:** Melqui
**Objetivo:** Adicionar login ao board-kanban via Clerk — magic link (email passwordless) + Google OAuth. Board inteiro atrás do login; servidor MCP segue protegido por token Bearer (não por Clerk).

## Contexto

O board ([[2026-06-26-board-kanban-mcp-design]]) hoje tem web aberto (v1, rede interna). Agora queremos autenticação real: só usuários logados acessam o board e a REST API. Os agentes do Time de IA continuam falando com `/api/mcp` via token Bearer — eles não têm sessão Clerk, então o MCP NÃO pode ficar atrás do Clerk.

## Decisões travadas

| Tema | Decisão |
|---|---|
| Provider | Clerk (`@clerk/nextjs`) |
| Métodos | Magic link (email link, passwordless) + Google OAuth |
| Escopo de proteção | Board UI + REST (`/api/columns`, `/api/cards`) atrás do login |
| MCP | `/api/mcp` público no Clerk; segue protegido por `MCP_TOKEN` (Bearer) |
| Identidade | Sincroniza usuário Clerk → tabela `User` do board (lazy, no load) |
| Roles/permissões | Fora do v1 — todo logado tem acesso total |
| Webhook de sync | Fora do v1 — sync lazy no carregamento |

## Arquitetura

### Clerk provider
`<ClerkProvider>` envolve o app em `src/app/layout.tsx`. As chaves vêm de env (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`). Os métodos (Email magic link + Google) são habilitados no dashboard do Clerk — não em código.

### Middleware (`src/middleware.ts`)
`clerkMiddleware` + `createRouteMatcher`:
- **Rotas públicas** (não exigem sessão): `/sign-in(.*)`, `/sign-up(.*)`, e **`/api/mcp(.*)`**.
- Todo o resto exige sessão (`auth.protect()`); não-logado é redirecionado pra `/sign-in`.
- `/api/mcp` é público no Clerk de propósito: seu próprio gate Bearer (`MCP_TOKEN`) é a autenticação dos agentes. Sessão Clerk não se aplica a chamadas máquina-a-máquina.
- `config.matcher` segue o padrão recomendado do Clerk (ignora estáticos/_next, inclui rotas de API).

### Rotas REST
As rotas (`/api/columns`, `/api/cards`) ficam atrás do middleware. Como reforço, cada handler chama `auth()` e retorna 401 se não houver `userId` — defesa em profundidade caso o matcher mude. (`/api/mcp` NÃO faz isso; usa só o Bearer.)

### Sign-in
Rota catch-all `src/app/sign-in/[[...rest]]/page.tsx` montando `<SignIn />` do Clerk. Mesma coisa para `sign-up` se necessário (Clerk gera o fluxo de magic link + Google a partir do dashboard).

### Sync de usuário (Clerk → tabela User)
- Schema: adicionar `clerkId String? @unique` ao model `User` (+ migration).
- Helper `syncCurrentUser()` em `src/server/users.ts` (server-only): lê o usuário Clerk atual (`currentUser()`), faz `upsert` na tabela `User` por `clerkId` (cria se novo, atualiza nome/email/avatarUrl). Retorna o `User` do board.
- Chamado no server component da página do board (`page.tsx`) antes de renderizar. Assim, o primeiro acesso de cada pessoa logada materializa o `User` do board → vira assignee e autor de comentários real.
- `add_comment` via MCP continua aceitando `actor` (nome/id) como antes — independente do Clerk.

### UI
`Chrome.tsx` (top bar): troca os avatares fake pelo `<UserButton />` do Clerk (logout/perfil) e mostra o usuário logado. Mantém o resto do layout (breadcrumb, título, toolbar).

## Modelo de dados (delta)

```prisma
model User {
  id        String  @id @default(cuid())
  clerkId   String? @unique   // NOVO
  name      String
  email     String? @unique
  avatarUrl String?
  cards     Card[]  @relation("CardAssignees")
  comments  Comment[]
}
```

Migration nova (`add_clerk_id`). Campos existentes inalterados.

## Config / ambientes

- `.env` / `.env.example`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
- Vercel: as duas chaves em Environment Variables.
- Dashboard Clerk: habilitar Email (magic link) + Google; setar URLs de sign-in/redirect.

## Testes

- **Middleware**: a lista de rotas públicas inclui `/api/mcp` e exclui board/REST. Teste do matcher/lista (sem subir o Clerk real — verifica a configuração das rotas públicas).
- **`syncCurrentUser`**: upsert por `clerkId` (cria novo, atualiza existente) com Prisma + `currentUser()` mockados.
- Tests existentes (positions, domínio, REST, MCP, auth gate MCP) seguem verdes. As rotas REST ganham o early-401: ajustar/mockar `auth()` nos testes de REST existentes para retornar um `userId`.
- Clerk é mockado em todos os testes (`@clerk/nextjs/server`).

## Fora de escopo (v1)

- Roles / RBAC (todo logado = acesso total).
- Webhook de sync do Clerk (sync é lazy no load).
- Organizações / multi-tenant do Clerk.
- Proteger `/api/mcp` por sessão (continua Bearer-only de propósito).

## Critérios de sucesso

1. Acessar `/` sem login → redireciona pra `/sign-in`.
2. Login por magic link (email) e por Google funcionam.
3. Logado → vê o board; `<UserButton>` permite logout.
4. Primeiro acesso logado cria/atualiza o `User` do board (com `clerkId`).
5. `/api/mcp` com `Bearer $MCP_TOKEN` funciona SEM sessão Clerk (agente não loga); sem token → 401.
6. `/api/cards` sem sessão → 401.
7. Tests verdes (existentes + novos de middleware e sync).
