# Subtarefas & Impedimentos — Design

**Data:** 2026-07-07
**Branch alvo:** feature nova a partir de `main`
**Status:** aprovado

## Problema

Cards precisam de:
1. **Subtarefas** — cards-filhos do tipo Subtask ou Bug vinculados a um card pai.
2. **Impedimento / Aviso** — sinalizar que um card está bloqueado (impedimento) ou merece atenção (aviso), com motivo.
3. **Visibilidade no board** — quando uma subtask/bug aparece no board como card próprio, mostrar claramente de qual card ela é filha.

## Abordagem escolhida

Subtask/Bug filho **é um Card normal** com `parentId` apontando pro pai. Reusa toda a
infra existente (comentários, anexos, assignees, drag, deep-link, Chave TI-N). Aparece
no board como card próprio, com badge indicando o pai.

Impedimento/Aviso = **flag no card + motivo** (enum `Blocker` + `blockerReason`).

Alternativas descartadas:
- Entidade `Subtask` leve separada (checklist só no drawer) — não atende "aparecer no board".
- Só badge visual sem motivo — usuário quer registrar o porquê do bloqueio.

## Data model (Prisma)

```prisma
enum CardType { BUG FEATURE TAREFA SUBTASK }   // + SUBTASK

enum Blocker { IMPEDIMENTO AVISO }             // novo

model Card {
  // ...campos existentes...
  parentId      String?
  parent        Card?    @relation("Subtasks", fields: [parentId], references: [id], onDelete: SetNull)
  children      Card[]   @relation("Subtasks")
  blocker       Blocker?
  blockerReason String?  @db.Text

  @@index([parentId])
}
```

- `onDelete: SetNull` — apagar o pai NÃO apaga os filhos; eles viram cards órfãos
  (sem badge de pai). Escolha conservadora (evita deleção em cascata destrutiva).
- Arquivar o pai não arquiva os filhos (fora de escopo v1).

## Server (`src/server/cards.ts`)

- `cardInclude` ganha:
  - `parent: { select: { id: true, code: true, title: true } }`
  - `children: { select: { id: true, column: { select: { name: true } } } }`
- `createCard` aceita `parentId`, `blocker`, `blockerReason`. Sem endpoint novo:
  a subtask é criada via `POST /api/cards` com `parentId` + `columnName: "A Fazer"`
  (primeira coluna) + `type` (SUBTASK|BUG).
- `updateCard` aceita `parentId` (null limpa), `blocker` (null limpa), `blockerReason`.

## Types (`src/server/types.ts`)

`CreateCardInput` / `UpdateCardInput` ganham `parentId?`, `blocker?`, `blockerReason?`.
`CardType` (Prisma) já cobre SUBTASK após migration.

## API

- `PATCH /api/cards/[id]`: adiciona `parentId`, `blocker`, `blockerReason` à lista
  `hasFields` que dispara `updateCard`.
- `POST /api/cards`: já repassa o body inteiro pro `createCard` — sem mudança.

## MCP (`src/mcp/server.ts`)

- `cardType` enum ganha `SUBTASK`.
- Corrige `priority` enum do MCP: adicionar `CRITICA` (faltando; schema já tem).
- `blocker` enum novo.
- `create_card` / `update_card`: novos inputs `parentId`, `blocker`, `blockerReason`.

## UI

### `colors.ts`
- `CARD_TYPE` ganha swatch `SUBTASK`.
- Novo `BLOCKER: Record<string, Swatch & { label, border, icon }>`:
  - `IMPEDIMENTO` → vermelho
  - `AVISO` → âmbar

### Card do board (`Card.tsx` — `CardView` + `CardData`)
`CardData` ganha:
- `parent?: { id, code, title } | null`
- `blocker?: "IMPEDIMENTO" | "AVISO" | null`
- `children?: { id, column: { name } }[]`

`CardView` renderiza:
- **Badge do pai** quando `parent`: `↖ {code} · {title}` (trunca), destaque no topo.
- **Impedimento/Aviso**: borda colorida no container do card (vermelho/âmbar) +
  badge com ícone (🚫 impedimento / ⚠️ aviso).
- **Progresso** quando `children.length`: badge `✓ {done}/{total}`, onde
  `done` = filhos em coluna cujo nome casa `/(done|conclu)/i`.
- **Badge tipo** SUBTASK (além dos existentes).

### `CardDrawer.tsx`
`CardDetail` ganha `parent`, `blocker`, `blockerReason`, `children`.
- `TYPE_OPTS` ganha `SUBTASK`.
- Nova Row **Impedimento**: Select (Nenhum/Impedimento/Aviso) + textarea de motivo
  visível quando setado. `patch({ blocker, blockerReason })`.
- **Card pai**: quando `parent`, linha com link que abre o card pai.
- Seção **Subtarefas**: lista os `children` (título, tipo, status) — cada um abre
  aquele card; botão "Adicionar subtarefa" com toggle Subtask/Bug + input de título →
  `POST /api/cards { parentId, columnName: <primeira coluna>, type, title }` + refetch.

### `CardDialog.tsx`
- `type` ganha opção SUBTASK. (Sem seletor de pai — subtask nasce dentro do pai.)

## Fluxo de dados

1. Board carrega via `GET /api/columns` → `listColumns` → cards com `parent`/`children`.
2. Abrir card → `GET /api/cards/[id]` → `getCard` com parent/children/comentários.
3. Criar subtask → `POST /api/cards` com `parentId` → aparece no board na 1ª coluna
   com badge do pai; pai atualiza contador de progresso no próximo poll (3s).
4. Setar impedimento → `PATCH` → borda/badge no board no próximo poll.

## Testes (TDD)

`src/server/cards.test.ts`:
- `createCard` com `parentId` vincula filho ao pai; filho aparece em `children` do pai.
- `createCard` type SUBTASK.
- `updateCard` seta/limpa `blocker` + `blockerReason`.
- `getCard`/`listColumns` incluem `parent` e `children`.

Front: seguir padrão existente (sem suíte de componente pesada; validar via `verify`).

## Fora de escopo (YAGNI)

- Seletor de card pai no dialog de criação.
- Arquivar pai → arquivar filhos em cascata.
- Reordenar subtasks dentro do pai (usam o drag normal do board).
