# Trava de bloqueio + status "Ajustes a Fazer" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que cards em bloqueio que trava mudem de coluna e adicionar o novo bloqueio azul "Ajustes a Fazer".

**Architecture:** Novo valor `AJUSTES` no enum `Blocker` do Prisma. A trava de movimentação (cross-column) é aplicada no servidor (`moveCard`), herdada pelo MCP, e espelhada na UI (guarda no `onDragEnd` + toast). Visual novo em `colors.ts`, `Card.tsx`, `CardDrawer.tsx`.

**Tech Stack:** Next.js, Prisma (PostgreSQL), React, @dnd-kit, vitest, sonner (toast), lucide-react.

## Global Constraints

- Conjunto que trava movimentação: `{ IMPEDIMENTO, AJUSTES }`. `AVISO` NÃO trava.
- Trava é cross-column apenas: reorder na mesma coluna sempre permitido.
- Cor de "Ajustes a Fazer": azul — `bg #d3e5ef`, `text #183347`, `border #4a90d9`.
- Label exato: `Ajustes a Fazer`. Ícone: `Wrench` (lucide), emoji do select `🔧`.
- Branch de trabalho: `feat/trava-bloqueio-ajustes` (já criada e ativa).

---

### Task 1: Enum `AJUSTES` no schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (enum `Blocker`)
- Create: `prisma/migrations/<timestamp>_blocker_ajustes/migration.sql` (gerado pelo Prisma)

**Interfaces:**
- Produces: valor `AJUSTES` no tipo `Blocker` do `@prisma/client` (usado por todas as tasks seguintes).

- [ ] **Step 1: Adicionar valor ao enum**

Em `prisma/schema.prisma`, trocar:

```prisma
enum Blocker {
  IMPEDIMENTO
  AVISO
}
```

por:

```prisma
enum Blocker {
  IMPEDIMENTO
  AVISO
  AJUSTES
}
```

- [ ] **Step 2: Subir o banco (se ainda não estiver de pé)**

Run: `npm run db:up`
Expected: container postgres `Started` / `Running`.

- [ ] **Step 3: Gerar migration + client**

Run: `npx prisma migrate dev --name blocker_ajustes`
Expected: cria `prisma/migrations/<timestamp>_blocker_ajustes/migration.sql` contendo `ALTER TYPE "Blocker" ADD VALUE 'AJUSTES';` e regenera o Prisma Client sem erro.

- [ ] **Step 4: Conferir a migration gerada**

Run: `cat prisma/migrations/*blocker_ajustes/migration.sql`
Expected: contém a linha `ALTER TYPE "Blocker" ADD VALUE 'AJUSTES';`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): valor AJUSTES no enum Blocker"
```

---

### Task 2: Trava de movimentação no servidor (`moveCard`)

**Files:**
- Modify: `src/server/cards.ts` (imports no topo + função `moveCard`, ~linha 262)
- Test: `src/server/cards.test.ts` (bloco `describe("moveCard")`, ~linha 36)

**Interfaces:**
- Consumes: `Blocker` de `./types`; `db.card.findUnique`, `resolveColumnId`, `positionBetween` (já existentes).
- Produces: `moveCard` lança `Error` em mudança de coluna quando `blocker ∈ {IMPEDIMENTO, AJUSTES}`; comportamento inalterado para reorder e para `AVISO`.

- [ ] **Step 1: Escrever os testes que falham**

Substituir o bloco `describe("moveCard", ...)` inteiro (linhas 36–45) em `src/server/cards.test.ts` por:

```ts
describe("moveCard", () => {
  it("calcula position no fim quando omitida", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: null });
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 2000 });
    const r = await moveCard("card1", "c1", undefined);
    expect(dbMock.card.update).toHaveBeenCalled();
    expect(r.position).toBe(2000);
  });

  it("rejeita mudança de coluna com IMPEDIMENTO", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "IMPEDIMENTO" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2" });
    await expect(moveCard("card1", "c2")).rejects.toThrow(/não pode mudar de coluna/);
    expect(dbMock.card.update).not.toHaveBeenCalled();
  });

  it("rejeita mudança de coluna com AJUSTES", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "AJUSTES" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2" });
    await expect(moveCard("card1", "c2")).rejects.toThrow(/não pode mudar de coluna/);
    expect(dbMock.card.update).not.toHaveBeenCalled();
  });

  it("permite mudança de coluna com AVISO", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "AVISO" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c2" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c2", position: 2000 });
    await expect(moveCard("card1", "c2")).resolves.toBeTruthy();
    expect(dbMock.card.update).toHaveBeenCalled();
  });

  it("permite reorder na mesma coluna mesmo com IMPEDIMENTO", async () => {
    dbMock.card.findUnique.mockResolvedValue({ columnId: "c1", blocker: "IMPEDIMENTO" });
    dbMock.column.findUnique.mockResolvedValue({ id: "c1" });
    dbMock.card.findMany.mockResolvedValue([{ position: 1000 }]);
    dbMock.card.update.mockResolvedValue({ id: "card1", columnId: "c1", position: 2000 });
    await expect(moveCard("card1", "c1")).resolves.toBeTruthy();
    expect(dbMock.card.update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npx vitest run src/server/cards.test.ts -t moveCard`
Expected: FAIL — os 4 testes novos falham (trava ainda não existe; `moveCard` não lança).

- [ ] **Step 3: Adicionar import e constantes**

Em `src/server/cards.ts`, trocar o import de tipos (linhas 3–5):

```ts
import type {
  CardFilter, CreateCardInput, UpdateCardInput,
} from "./types";
```

por:

```ts
import type {
  CardFilter, CreateCardInput, UpdateCardInput, Blocker,
} from "./types";

// Bloqueios que impedem o card de mudar de coluna (reorder na mesma coluna é livre).
const BLOCKING_MOVE: Blocker[] = ["IMPEDIMENTO", "AJUSTES"];
const BLOCKER_LABEL: Record<Blocker, string> = {
  IMPEDIMENTO: "Impedimento",
  AVISO: "Aviso",
  AJUSTES: "Ajustes a Fazer",
};
```

- [ ] **Step 4: Aplicar a trava em `moveCard`**

Substituir o início de `moveCard` (o bloco que resolve `columnId`, linhas 262–271):

```ts
export async function moveCard(id: string, columnIdRef: string, position?: number, actor?: string) {
  let columnId: string;
  if (!columnIdRef) {
    const card = await db.card.findUnique({ where: { id }, select: { columnId: true } });
    if (!card) throw new Error(`Card não encontrado: ${id}`);
    columnId = card.columnId;
  } else {
    columnId = await resolveColumnId({ columnId: columnIdRef, columnName: columnIdRef });
  }
```

por:

```ts
export async function moveCard(id: string, columnIdRef: string, position?: number, actor?: string) {
  const current = await db.card.findUnique({
    where: { id }, select: { columnId: true, blocker: true },
  });
  if (!current) throw new Error(`Card não encontrado: ${id}`);
  const columnId = columnIdRef
    ? await resolveColumnId({ columnId: columnIdRef, columnName: columnIdRef })
    : current.columnId;
  // Bloqueio que trava impede mudar DE coluna; reorder na mesma coluna passa.
  if (columnId !== current.columnId && current.blocker && BLOCKING_MOVE.includes(current.blocker)) {
    throw new Error(`Card em ${BLOCKER_LABEL[current.blocker]} não pode mudar de coluna`);
  }
```

(O restante da função — cálculo de `pos`, `assignees`, `db.card.update` — permanece igual.)

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `npx vitest run src/server/cards.test.ts -t moveCard`
Expected: PASS — 5 testes (o original + os 4 novos).

- [ ] **Step 6: Commit**

```bash
git add src/server/cards.ts src/server/cards.test.ts
git commit -m "feat(card): bloqueio que trava impede mudar de coluna"
```

---

### Task 3: Enum do MCP aceita `AJUSTES`

**Files:**
- Modify: `src/mcp/server.ts` (linha 7 e descrições em ~67, ~97)

**Interfaces:**
- Consumes: `cards.moveCard` (trava já vem do servidor — Task 2). Nenhuma mudança de lógica no `move_card`.
- Produces: `create_card`/`update_card` aceitam `blocker: "AJUSTES"`.

- [ ] **Step 1: Ampliar o enum do blocker**

Em `src/mcp/server.ts` linha 7, trocar:

```ts
const blocker = z.enum(["IMPEDIMENTO", "AVISO"]);
```

por:

```ts
const blocker = z.enum(["IMPEDIMENTO", "AVISO", "AJUSTES"]);
```

- [ ] **Step 2: Atualizar as descrições**

Trocar (linha ~67):

```ts
        blocker: blocker.optional().describe("Impedimento ou Aviso"),
```

por:

```ts
        blocker: blocker.optional().describe("Impedimento, Aviso ou Ajustes a Fazer"),
```

E trocar (linha ~97):

```ts
        blocker: blocker.nullable().optional().describe("Impedimento/Aviso (null limpa)"),
```

por:

```ts
        blocker: blocker.nullable().optional().describe("Impedimento/Aviso/Ajustes a Fazer (null limpa)"),
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(mcp): blocker aceita AJUSTES"
```

---

### Task 4: Visual do novo bloqueio (chip azul + ícone + select)

**Files:**
- Modify: `src/components/board/colors.ts` (`BLOCKER`, ~linha 41)
- Modify: `src/components/board/Card.tsx` (import lucide linha 5; union `blocker` linha 27; ícone linha 128)
- Modify: `src/components/board/CardDrawer.tsx` (import lucide linhas 6–10; union `blocker` linha 49; ícone linha 353; `SelectItem` linha 580)

**Interfaces:**
- Consumes: `Wrench` de `lucide-react`; `BLOCKER` de `./colors`.
- Produces: `CardData.blocker` e o tipo do drawer aceitam `"AJUSTES"`; `BLOCKER.AJUSTES` disponível.

- [ ] **Step 1: Adicionar o swatch azul em `colors.ts`**

Em `src/components/board/colors.ts`, no objeto `BLOCKER` (linhas 41–44), adicionar a terceira entrada:

```ts
export const BLOCKER: Record<string, Swatch & { label: string; border: string }> = {
  IMPEDIMENTO: { label: "Impedimento", bg: "#ffe2dd", text: "#a3231a", border: "#e5484d" },
  AVISO: { label: "Aviso", bg: "#fdecc8", text: "#9a6c16", border: "#e8a72f" },
  AJUSTES: { label: "Ajustes a Fazer", bg: "#d3e5ef", text: "#183347", border: "#4a90d9" },
};
```

- [ ] **Step 2: `Card.tsx` — import, tipo e ícone**

Linha 5, adicionar `Wrench` ao import lucide:

```ts
import { MessageCircle, MoreHorizontal, Link2, Archive, Ban, TriangleAlert, Wrench, CornerLeftUp, CircleCheck } from "lucide-react";
```

Linha 27, ampliar a union:

```ts
  blocker?: "IMPEDIMENTO" | "AVISO" | "AJUSTES" | null;
```

Linha 128, trocar o ternário de ícone:

```tsx
            {card.blocker === "IMPEDIMENTO" ? <Ban className="size-3" /> : card.blocker === "AJUSTES" ? <Wrench className="size-3" /> : <TriangleAlert className="size-3" />}
```

- [ ] **Step 3: `CardDrawer.tsx` — import, tipo, ícone e select**

Linhas 6–10, adicionar `Wrench` ao import lucide (junto aos demais ícones):

```ts
import {
  Hash, Flag, CalendarDays, CircleDot, Users as UsersIcon, Check, Plus,
  FileText, Paperclip, Eye, Pencil, Loader2, X, Archive, Tag, GitBranch, Clock,
  Package, UserPlus, ExternalLink, Ban, TriangleAlert, Wrench, ListTree, CornerLeftUp,
} from "lucide-react";
```

Linha 49, ampliar a union:

```ts
  blocker: "IMPEDIMENTO" | "AVISO" | "AJUSTES" | null;
```

Linha 353, trocar o ternário de ícone:

```tsx
                  {card.blocker === "IMPEDIMENTO" ? <Ban className="size-3" /> : card.blocker === "AJUSTES" ? <Wrench className="size-3" /> : <TriangleAlert className="size-3" />}
```

Linha 580, adicionar o `SelectItem` após o de Aviso:

```tsx
                        <SelectItem value="IMPEDIMENTO">🚫 Impedimento</SelectItem>
                        <SelectItem value="AVISO">⚠️ Aviso</SelectItem>
                        <SelectItem value="AJUSTES">🔧 Ajustes a Fazer</SelectItem>
```

- [ ] **Step 4: Verificar typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/colors.ts src/components/board/Card.tsx src/components/board/CardDrawer.tsx
git commit -m "feat(card): chip azul e opção Ajustes a Fazer no bloqueio"
```

---

### Task 5: Guarda de arraste na UI (`Board.tsx`)

**Files:**
- Modify: `src/components/board/Board.tsx` (import topo linhas 1–10; função `onDragEnd`, após ~linha 95)

**Interfaces:**
- Consumes: `toast` de `sonner`; `from.card.blocker`, `from.col`, `overCol` (já disponíveis em `onDragEnd`).
- Produces: arraste cross-column de card bloqueado é abortado antes do estado otimista, com toast.

- [ ] **Step 1: Importar `toast`**

Em `src/components/board/Board.tsx`, adicionar após a linha 10 (`import { applyView, ... } from "./view";`):

```ts
import { toast } from "sonner";
```

- [ ] **Step 2: Abortar arraste cross-column de card bloqueado**

Em `onDragEnd`, logo após o bloco que define `overCol` e antes de `const prev = columns;` (linha 95→97), inserir:

```ts
    // Card em bloqueio que trava não muda de coluna (espelha o servidor).
    if (
      overCol.id !== from.col.id &&
      (from.card.blocker === "IMPEDIMENTO" || from.card.blocker === "AJUSTES")
    ) {
      toast.error(
        `Card em ${from.card.blocker === "IMPEDIMENTO" ? "Impedimento" : "Ajustes a Fazer"} não pode mudar de coluna`,
      );
      return;
    }
```

- [ ] **Step 3: Verificar typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual no app**

Run: `npm run dev`, abrir o board, pôr um card em Impedimento (e outro em Ajustes a Fazer), tentar arrastar para outra coluna.
Expected: card não muda de coluna, toast aparece; reordenar na mesma coluna funciona; card com Aviso ainda move normalmente.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: PASS (todos os testes verdes).

- [ ] **Step 6: Commit**

```bash
git add src/components/board/Board.tsx
git commit -m "feat(board): trava arraste de card bloqueado entre colunas"
```

---

## Self-Review

**Spec coverage:**
- Enum `AJUSTES` + migration → Task 1. ✅
- Trava servidor + MCP → Task 2 (servidor) + Task 3 (MCP herda). ✅
- Trava UI (drag) → Task 5. ✅
- Visual azul + ícone + select → Task 4. ✅
- Testes moveCard (4 casos) → Task 2. ✅
- Cross-column apenas / AVISO livre → coberto em constante `BLOCKING_MOVE` e testes. ✅

**Placeholder scan:** nenhum TBD/TODO; todo passo tem código/comando concreto.

**Type consistency:** `Blocker` importado de `./types` (re-exporta do Prisma); `BLOCKING_MOVE: Blocker[]` e `BLOCKER_LABEL: Record<Blocker, string>` usam os 3 valores; union `"IMPEDIMENTO" | "AVISO" | "AJUSTES" | null` idêntica em `Card.tsx` e `CardDrawer.tsx`; label "Ajustes a Fazer" consistente em colors/select/toast/BLOCKER_LABEL.
