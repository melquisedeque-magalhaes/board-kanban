# Trava de movimentação por bloqueio + status "Ajustes a Fazer"

Data: 2026-07-13

## Problema

Cards em Impedimento hoje só têm sinalização visual — nada impede movê-los de
coluna, então um card bloqueado avança no fluxo sem o impedimento ter sido
resolvido. Além disso, falta um estado intermediário para o time indicar que um
card precisa de retrabalho/ajuste antes de seguir.

## Objetivo

1. Card em bloqueio que trava **não pode mudar de coluna** (reorder na mesma
   coluna continua permitido).
2. Novo valor de bloqueio **"Ajustes a Fazer"** (cor azul), como flag para os
   devs saberem o que precisa ser atuado. Este estado **também trava** a
   movimentação de coluna.

## Decisões

- **Ajustes a Fazer trava**, igual a Impedimento. `AVISO` continua livre.
- Enforcement em **UI + servidor + MCP** — regra consistente em toda porta de
  entrada.
- Trava é **cross-column apenas**: reordenar dentro da mesma coluna é permitido
  (o usuário pediu "não mover de coluna").
- Ícone do novo estado: `Wrench` (🔧), distinto de `Ban` (Impedimento) e
  `TriangleAlert` (Aviso).

## Modelo de dados

`prisma/schema.prisma` — enum `Blocker` ganha valor `AJUSTES`:

```prisma
enum Blocker {
  IMPEDIMENTO
  AVISO
  AJUSTES
}
```

Migration Prisma correspondente. Nenhuma coluna nova no `Card` (reusa
`blocker` / `blockerReason`).

**Conjunto que trava movimentação:** `{ IMPEDIMENTO, AJUSTES }`.

## Regra de trava

### Servidor — `src/server/cards.ts` `moveCard`

- Buscar `blocker` + `columnId` atual do card no início.
- Resolver `columnId` de destino (já existe via `resolveColumnId`).
- Se destino resolvido **≠** coluna atual **e** `blocker ∈ {IMPEDIMENTO, AJUSTES}`
  → `throw new Error("Card em <label> não pode mudar de coluna")`.
- Reorder na mesma coluna (destino == coluna atual, ou `columnIdRef` vazio) passa
  normalmente.
- Definir constante compartilhada, ex.:
  `const BLOCKING_MOVE: Blocker[] = ["IMPEDIMENTO", "AJUSTES"]`.

### MCP — `src/mcp/server.ts`

- Enum `blocker` (linha ~7) ganha `"AJUSTES"`:
  `z.enum(["IMPEDIMENTO", "AVISO", "AJUSTES"])`.
- `move_card` chama `cards.moveCard`, então herda a trava do servidor
  automaticamente. Descrições ajustadas para citar o novo valor.

### UI — `src/components/board/Board.tsx` `onDragEnd`

- Após identificar `from` e `overCol`: se `overCol.id !== from.col.id` **e**
  `from.card.blocker ∈ {IMPEDIMENTO, AJUSTES}` → abortar (return) **sem** aplicar
  estado otimista e exibir toast avisando (evita flicker de mover-e-voltar).
- Drop na mesma coluna segue o caminho normal de reorder.

## Visual

### `src/components/board/colors.ts`

Adicionar ao `BLOCKER`:

```ts
AJUSTES: { label: "Ajustes a Fazer", bg: "#d3e5ef", text: "#183347", border: "#4a90d9" },
```

### `src/components/board/Card.tsx` e `CardDrawer.tsx`

- Tipo union do blocker: `"IMPEDIMENTO" | "AVISO" | "AJUSTES"`.
- Ícone: mapear `AJUSTES` → `Wrench` (import de `lucide-react`). Trocar o
  ternário atual (`=== "IMPEDIMENTO" ? Ban : TriangleAlert`) por seleção de 3
  vias.

### `CardDrawer.tsx` — select de blocker

Novo item após Aviso:

```tsx
<SelectItem value="AJUSTES">🔧 Ajustes a Fazer</SelectItem>
```

## Testes — `src/server/cards.test.ts`

- `moveCard` cross-column com `IMPEDIMENTO` → rejeita (throw).
- `moveCard` cross-column com `AJUSTES` → rejeita (throw).
- `moveCard` cross-column com `AVISO` → permite.
- `moveCard` reorder na mesma coluna com `IMPEDIMENTO` → permite.

## Arquivos afetados

- `prisma/schema.prisma` (+ migration)
- `src/server/cards.ts`
- `src/mcp/server.ts`
- `src/components/board/colors.ts`
- `src/components/board/Card.tsx`
- `src/components/board/CardDrawer.tsx`
- `src/components/board/Board.tsx`
- `src/server/cards.test.ts`

## Fora de escopo

- Não altera `AVISO`.
- Não adiciona novas colunas/tabelas.
- Não trava reorder dentro da mesma coluna.
