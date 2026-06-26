# Board Kanban (Notion-like) + MCP — Design

**Data:** 2026-06-26
**Autor:** Melqui
**Objetivo:** Board kanban estilo Notion para o Time de IA, com servidor MCP remoto para os agentes do time lerem e escreverem cards programaticamente.

## Contexto

O time de IA usa hoje um board no Notion ("Board Time de IA"). Queremos uma versão própria, self-hosted, com a mesma UX de kanban **e** uma camada MCP de primeira classe — para que os agentes (Fusion, etc.) listem, criem e movam cards direto, sem depender da API/limites do Notion.

## Decisões travadas

| Tema | Decisão |
|---|---|
| Stack | Next.js (App Router) + TypeScript + Prisma + Postgres |
| Persistência | Postgres em Docker (local) / Postgres gerenciado em prod (Vercel) |
| Deploy | Vercel |
| MCP transport | Remoto HTTP/SSE (streamable HTTP) hospedado em `/api/mcp` |
| Auth web | Aberto pro time no v1 (rede interna) |
| Auth MCP | Bearer token (`MCP_TOKEN`) |
| UI v1 | Core fiel: colunas drag-drop, prioridade, assignees, labels, contador de comentários |
| Board | Único no v1 (schema já suporta N) |
| Página do card | Fora do v1 (v2) |

## Arquitetura

App único Next.js — web + REST interno + MCP no mesmo deploy e mesmo Postgres.

```
board-kanban/
  docker-compose.yml            # Postgres local
  prisma/schema.prisma
  prisma/seed.ts                # board + colunas + dados de exemplo
  .env / .env.example           # DATABASE_URL, MCP_TOKEN
  src/
    app/
      page.tsx                  # board (server fetch + <Board/> client)
      layout.tsx
      api/
        columns/route.ts        # GET colunas
        cards/route.ts          # GET (filtros), POST (criar)
        cards/[id]/route.ts     # PATCH (editar/mover), DELETE
        mcp/route.ts            # MCP streamable HTTP (token-protected)
    components/board/
      Board.tsx                 # DndContext, estado otimista
      Column.tsx
      Card.tsx
      CardDialog.tsx            # criar/editar card (modal)
    lib/
      db.ts                     # PrismaClient singleton
      positions.ts             # cálculo de position no reorder
    server/
      cards.ts                  # camada de domínio (usada por REST e MCP)
    mcp/
      server.ts                 # define tools, monta o handler MCP
      tools.ts                  # implementação de cada tool -> server/cards.ts
```

**Princípio chave:** REST e MCP **não duplicam lógica**. Ambos chamam `src/server/cards.ts` (camada de domínio pura sobre Prisma). Tool MCP = wrapper fino + validação Zod sobre a mesma função que a rota REST usa.

## Modelo de dados (Prisma)

```prisma
enum Priority { ALTA MEDIA BAIXA }

model Board {
  id        String   @id @default(cuid())
  name      String
  columns   Column[]
  createdAt DateTime @default(now())
}

model Column {
  id       String  @id @default(cuid())
  boardId  String
  board    Board   @relation(fields: [boardId], references: [id], onDelete: Cascade)
  name     String
  color    String?            // hex/token da cor do header
  position Float              // ordem das colunas
  cards    Card[]
}

model Card {
  id          String     @id @default(cuid())
  columnId    String
  column      Column     @relation(fields: [columnId], references: [id], onDelete: Cascade)
  code        String?    // ex "TI-14"
  title       String
  description String?    @db.Text
  priority    Priority?
  position    Float      // ordem dentro da coluna
  assignees   User[]     @relation("CardAssignees")
  labels      Label[]    @relation("CardLabels")
  comments    Comment[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model User {
  id       String  @id @default(cuid())
  name     String
  email    String? @unique
  avatarUrl String?
  cards    Card[]  @relation("CardAssignees")
  comments Comment[]
}

model Label {
  id    String @id @default(cuid())
  name  String
  color String
  cards Card[] @relation("CardLabels")
}

model Comment {
  id        String   @id @default(cuid())
  cardId    String
  card      Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  authorId  String?
  author    User?    @relation(fields: [authorId], references: [id])
  body      String   @db.Text
  createdAt DateTime @default(now())
}
```

### Position / reorder
`position` é `Float`. Inserção/movimento calcula a média entre o vizinho anterior e o próximo (`prev.position + next.position) / 2`); ponta usa `±1000`. Sem renumeração em massa. Rebalance só se o gap ficar minúsculo (edge raro, tratado em `positions.ts`).

## Drag-drop (web)

`@dnd-kit/core` + `@dnd-kit/sortable`. `Board.tsx` mantém estado local das colunas/cards; ao soltar:
1. update otimista da UI (move o card, recalcula position no cliente)
2. `PATCH /api/cards/[id]` com `{ columnId, position }`
3. erro → rollback + toast

## MCP server (`/api/mcp`)

Streamable HTTP usando `@modelcontextprotocol/sdk`. Toda request exige `Authorization: Bearer ${MCP_TOKEN}` — 401 sem isso.

**Tools:**

| Tool | Input | Retorno |
|---|---|---|
| `list_columns` | — | colunas + ordem |
| `list_cards` | `{ columnId?, columnName?, assignee?, priority? }` | cards filtrados |
| `get_card` | `{ id }` | card completo + comentários |
| `create_card` | `{ columnName\|columnId, title, description?, priority?, code?, assignees?[], labels?[] }` | card criado |
| `update_card` | `{ id, ...campos }` | card atualizado |
| `move_card` | `{ id, columnName\|columnId, position? }` | card movido (position calculada se omitida → fim da coluna) |
| `add_comment` | `{ cardId, body, actor? }` | comentário criado |
| `list_users` | — | usuários (p/ assignment) |
| `list_labels` | — | labels disponíveis |

Inputs validados com Zod. Tools resolvem coluna/usuário por **nome ou id** (agente manda "Em Andamento", server resolve). `actor` opcional registra autor em comentários/mutations.

## Auth

- **Web:** aberto no v1.
- **MCP:** `MCP_TOKEN` em env. Handler rejeita sem Bearer correto. Token gerado e guardado fora do repo.

## Config / ambientes

- `docker-compose.yml`: Postgres 16, volume persistente, porta 5432.
- `.env.example`: `DATABASE_URL`, `MCP_TOKEN`.
- Local: `docker compose up -d` → `prisma migrate dev` → `prisma db seed` → `npm run dev`.
- Prod (Vercel): `DATABASE_URL` aponta pro Postgres gerenciado (marketplace), `MCP_TOKEN` em env vars.

## Testes

- **Vitest** em `lib/positions.ts` (cálculo de position: meio, pontas, rebalance).
- **Vitest** na camada `server/cards.ts` e nas tools MCP com Prisma mockado (criar/mover/filtrar).
- E2E (Playwright) leve fica pra depois do v1.

## Fora de escopo (v1)

- Página interna do card (descrição rica, thread de comentários) → v2.
- Múltiplos boards na UI (schema já suporta).
- Login real por usuário / RBAC.
- Realtime/websocket (refetch on focus basta no v1).
- Filtros/sort avançados na UI.

## Critérios de sucesso

1. `docker compose up` + migrate + seed + `npm run dev` → board navegável com dados de exemplo.
2. Arrastar card entre colunas persiste e sobrevive a reload.
3. Criar/editar card pela UI funciona.
4. Agente externo conecta no MCP remoto com token e consegue: listar colunas, criar card, mover card, listar cards filtrados.
5. REST e MCP compartilham a mesma camada de domínio (sem lógica duplicada).
