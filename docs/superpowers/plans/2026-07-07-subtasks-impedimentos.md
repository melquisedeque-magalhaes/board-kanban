# Subtarefas & Impedimentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards podem ter subtarefas (Subtask/Bug) via `parentId`, e podem ser marcados com Impedimento/Aviso + motivo; o board mostra o vínculo pai-filho e o bloqueio.

**Architecture:** Subtask/Bug filho é um Card normal com `parentId` (self-relation). Impedimento/Aviso é um enum `Blocker` + `blockerReason` no Card. Server (`cards.ts`) inclui `parent`/`children` no payload e aceita os novos campos em create/update; API e MCP repassam; a UI (Card do board, CardDrawer, CardDialog) renderiza badges, borda de bloqueio, seção de subtarefas.

**Tech Stack:** Next.js (App Router), Prisma + PostgreSQL, React + @tanstack/react-query, shadcn/ui + Tailwind, lucide-react, @modelcontextprotocol/sdk, Vitest (db mockado), @dnd-kit.

## Global Constraints

- Prisma migrations via `npm run db:migrate` (= `prisma migrate dev`). Naming: `AAAAMMDDHHMMSS_descricao`.
- Testes: Vitest com `db` mockado (`vi.mock("@/lib/db")`) — unit, sem DB real. Rodar: `npm test`.
- Lint: `npm run lint` (eslint). Sem warnings novos.
- Copy da UI em pt-BR, sentence case, voz ativa (frontend-design: "Adicionar subtarefa", não "Submit").
- Design system existente = Notion/shadcn. Aplicar frontend-design com RESTRAINT: reusar `Swatch`/`Badge`/`Row`/`inlineField`, não inventar identidade nova. A "ousadia" concentra num único elemento: a borda de impedimento.
- Enum priority do MCP hoje NÃO tem `CRITICA` (schema tem) — corrigir junto.
- `onDelete: SetNull` nos filhos (apagar pai não apaga filhos).

## File Structure

- `prisma/schema.prisma` — MODIFICAR: enum CardType (+SUBTASK), enum Blocker (novo), Card (+parentId/parent/children/blocker/blockerReason/@@index).
- `prisma/migrations/<ts>_card_subtasks_blocker/migration.sql` — CRIAR (gerado pelo prisma).
- `src/server/types.ts` — MODIFICAR: CreateCardInput/UpdateCardInput +parentId/blocker/blockerReason.
- `src/server/cards.ts` — MODIFICAR: cardInclude (+parent/children), createCard/updateCard.
- `src/server/cards.test.ts` — MODIFICAR: novos testes.
- `src/app/api/cards/[id]/route.ts` — MODIFICAR: hasFields list.
- `src/mcp/server.ts` — MODIFICAR: enums + inputs create/update.
- `src/components/board/colors.ts` — MODIFICAR: CARD_TYPE (+SUBTASK), BLOCKER (novo).
- `src/components/board/Card.tsx` — MODIFICAR: CardData + CardView (parent badge, blocker, progresso).
- `src/components/board/CardDrawer.tsx` — MODIFICAR: CardDetail + Row impedimento + link pai + seção subtarefas.
- `src/components/board/CardDialog.tsx` — MODIFICAR: opção SUBTASK.

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_card_subtasks_blocker/migration.sql` (via prisma)

**Interfaces:**
- Produces: enum `CardType` ganha `SUBTASK`; enum `Blocker { IMPEDIMENTO, AVISO }`; `Card.parentId: String?`, `Card.parent: Card?`, `Card.children: Card[]`, `Card.blocker: Blocker?`, `Card.blockerReason: String?`.

- [ ] **Step 1: Editar `enum CardType`** (schema.prisma) — adicionar `SUBTASK`:

```prisma
enum CardType {
  BUG
  FEATURE
  TAREFA
  SUBTASK
}
```

- [ ] **Step 2: Adicionar `enum Blocker`** logo abaixo de CardType:

```prisma
enum Blocker {
  IMPEDIMENTO
  AVISO
}
```

- [ ] **Step 3: Adicionar campos no `model Card`** (após `requestedBy` relation, antes de `assignees`):

```prisma
  parentId      String?
  parent        Card?     @relation("Subtasks", fields: [parentId], references: [id], onDelete: SetNull)
  children      Card[]    @relation("Subtasks")
  blocker       Blocker?
  blockerReason String?   @db.Text
```

E adicionar o índice junto ao `@@index([archivedAt])` existente:

```prisma
  @@index([parentId])
```

- [ ] **Step 4: Gerar a migration**

Run: `npm run db:migrate -- --name card_subtasks_blocker`
Expected: cria `prisma/migrations/<ts>_card_subtasks_blocker/migration.sql`, aplica no DB local, `prisma generate` regenera o client sem erro. (Precisa do Postgres local via `npm run db:up`.)

- [ ] **Step 5: Validar schema + client**

Run: `npx prisma validate && npx tsc --noEmit`
Expected: "The schema at prisma/schema.prisma is valid" e tsc sem erros (o client tipa os campos novos).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): parentId de subtarefas + enum Blocker no Card"
```

---

### Task 2: Server — createCard/updateCard + include (TDD)

**Files:**
- Modify: `src/server/types.ts`
- Modify: `src/server/cards.ts:7-12` (cardInclude), `:200-245` (create/update)
- Test: `src/server/cards.test.ts`

**Interfaces:**
- Consumes: enums da Task 1.
- Produces:
  - `CreateCardInput` ganha `parentId?: string`, `blocker?: Blocker`, `blockerReason?: string`.
  - `UpdateCardInput` ganha `parentId?: string | null`, `blocker?: Blocker | null`, `blockerReason?: string | null`.
  - `cardInclude` passa a incluir `parent: {select:{id,code,title}}` e `children: {select:{id, column:{select:{name}}}}`.
  - `createCard`/`updateCard` gravam os campos novos.

- [ ] **Step 1: Editar `src/server/types.ts`** — importar Blocker e estender inputs:

```ts
import type { Priority, CardType, Blocker } from "@prisma/client";
export type { Priority, CardType, Blocker };
```

Em `CreateCardInput` adicionar:

```ts
  parentId?: string;
  blocker?: Blocker;
  blockerReason?: string;
```

Em `UpdateCardInput` adicionar:

```ts
  parentId?: string | null;
  blocker?: Blocker | null;
  blockerReason?: string | null;
```

- [ ] **Step 2: Escrever o teste que falha** — adicionar em `src/server/cards.test.ts` (import `createCard, updateCard` na linha 13):

```ts
import {
  resolveColumnId, moveCard, deleteCard, assignCard, unassignCard, addComment,
  createCard, updateCard,
} from "./cards";

describe("createCard subtask/blocker", () => {
  it("grava parentId e blocker ao criar", async () => {
    dbMock.column.findFirst.mockResolvedValue({ id: "col1" });
    dbMock.card.findMany.mockResolvedValue([]);      // sem cards → position base
    dbMock.card.findMany.mockResolvedValueOnce([]);  // last position
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.label.findMany.mockResolvedValue([]);
    dbMock.card.create.mockResolvedValue({ id: "new1" });
    await createCard({
      columnName: "A Fazer", title: "Corrigir X", type: "BUG",
      parentId: "parent1", blocker: "IMPEDIMENTO", blockerReason: "esperando API",
    });
    expect(dbMock.card.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        parentId: "parent1", blocker: "IMPEDIMENTO", blockerReason: "esperando API",
      }),
    }));
  });
});

describe("updateCard blocker", () => {
  it("limpa blocker com null e seta motivo", async () => {
    dbMock.card.update.mockResolvedValue({ id: "c1" });
    await updateCard("c1", { blocker: null, blockerReason: null });
    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ blocker: null, blockerReason: null }),
    }));
  });
  it("vincula parentId no update", async () => {
    dbMock.card.update.mockResolvedValue({ id: "c1" });
    await updateCard("c1", { parentId: "p9" });
    expect(dbMock.card.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parentId: "p9" }),
    }));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- cards`
Expected: FAIL — `createCard`/`updateCard` ainda não gravam `parentId`/`blocker`/`blockerReason` (assertions não batem).

- [ ] **Step 4: Implementar em `cards.ts`**

Em `cardInclude` (linhas ~7-12) adicionar:

```ts
const cardInclude = {
  assignees: true,
  requestedBy: true,
  labels: true,
  parent: { select: { id: true, code: true, title: true } },
  children: { select: { id: true, column: { select: { name: true } } } },
  _count: { select: { comments: true } },
} as const;
```

No `db.card.create({ data: {...} })` do `createCard` adicionar ao objeto `data`:

```ts
      parentId: input.parentId ?? null,
      blocker: input.blocker ?? null,
      blockerReason: input.blockerReason ?? null,
```

No `db.card.update({ data: {...} })` do `updateCard` adicionar ao objeto `data`:

```ts
      parentId: input.parentId,
      blocker: input.blocker,
      blockerReason: input.blockerReason,
```

(No update, `undefined` = não mexe; `null` = limpa — comportamento Prisma padrão, igual aos demais campos.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- cards`
Expected: PASS (todos, incluindo os antigos).

- [ ] **Step 6: Commit**

```bash
git add src/server/types.ts src/server/cards.ts src/server/cards.test.ts
git commit -m "feat(server): createCard/updateCard aceitam parentId e blocker + include parent/children"
```

---

### Task 3: API PATCH — reconhecer novos campos

**Files:**
- Modify: `src/app/api/cards/[id]/route.ts:33-34`

**Interfaces:**
- Consumes: `updateCard` da Task 2.
- Produces: PATCH aplica `parentId`/`blocker`/`blockerReason`.

- [ ] **Step 1: Editar a lista `hasFields`** — adicionar as 3 chaves:

```ts
  const hasFields = ["title", "description", "details", "priority", "type", "version", "branchUrl", "requestedBy", "code", "dueDate", "assignees", "labels", "parentId", "blocker", "blockerReason"]
    .some((k) => k in body);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cards/[id]/route.ts
git commit -m "feat(api): PATCH de card aceita parentId/blocker/blockerReason"
```

---

### Task 4: MCP — enums + inputs

**Files:**
- Modify: `src/mcp/server.ts:5-6` (enums), `:44-88` (create/update)

**Interfaces:**
- Consumes: `createCard`/`updateCard` da Task 2.
- Produces: MCP expõe SUBTASK, CRITICA (fix), blocker, parentId, blockerReason.

- [ ] **Step 1: Corrigir/estender enums** (linhas 5-6):

```ts
const priority = z.enum(["CRITICA", "ALTA", "MEDIA", "BAIXA"]);
const cardType = z.enum(["BUG", "FEATURE", "TAREFA", "SUBTASK"]);
const blocker = z.enum(["IMPEDIMENTO", "AVISO"]);
```

- [ ] **Step 2: `create_card` inputSchema** — adicionar dentro de `inputSchema: {...}`:

```ts
        parentId: z.string().optional().describe("id do card pai (torna este card uma subtarefa)"),
        blocker: blocker.optional().describe("Impedimento ou Aviso"),
        blockerReason: z.string().optional().describe("Motivo do impedimento/aviso"),
```

Atualizar o `.describe` do `type` para: `"Tipo: BUG, FEATURE, TAREFA ou SUBTASK"`.

- [ ] **Step 3: `update_card` inputSchema** — adicionar:

```ts
        parentId: z.string().nullable().optional().describe("id do card pai (null desvincula)"),
        blocker: blocker.nullable().optional().describe("Impedimento/Aviso (null limpa)"),
        blockerReason: z.string().nullable().optional().describe("Motivo (null limpa)"),
```

Atualizar `.describe` do `type` para incluir SUBTASK.

- [ ] **Step 4: Typecheck + testes MCP**

Run: `npx tsc --noEmit && npm test -- server`
Expected: sem erros; testes MCP existentes passam.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(mcp): expõe subtarefa (parentId), blocker e tipo SUBTASK; fix CRITICA no enum"
```

---

### Task 5: colors.ts — swatch SUBTASK + BLOCKER

**Files:**
- Modify: `src/components/board/colors.ts:33-37`

**Interfaces:**
- Produces: `CARD_TYPE.SUBTASK`; `BLOCKER: Record<"IMPEDIMENTO"|"AVISO", { label, bg, text, border }>`.

- [ ] **Step 1: Adicionar SUBTASK ao `CARD_TYPE`** (dentro do objeto existente):

```ts
  SUBTASK: { label: "Subtask", bg: "#e8e3f7", text: "#4b2e83" },
```

- [ ] **Step 2: Adicionar o mapa `BLOCKER`** após `CARD_TYPE`:

```ts
// Bloqueio do card: impedimento (vermelho, trava) vs aviso (âmbar, atenção).
export const BLOCKER: Record<string, Swatch & { label: string; border: string }> = {
  IMPEDIMENTO: { label: "Impedimento", bg: "#ffe2dd", text: "#a3231a", border: "#e5484d" },
  AVISO: { label: "Aviso", bg: "#fdecc8", text: "#9a6c16", border: "#e8a72f" },
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/board/colors.ts
git commit -m "feat(ui): cores de SUBTASK e do bloqueio (impedimento/aviso)"
```

---

### Task 6: Card do board — parent badge, borda de bloqueio, progresso

**Files:**
- Modify: `src/components/board/Card.tsx` (CardData `:21-31`, CardView `:34-114`)

**Interfaces:**
- Consumes: `CARD_TYPE`, `BLOCKER` da Task 5.
- Produces: `CardData` com `parent`, `blocker`, `children`. `CardView` renderiza os 3.

frontend-design: a borda de impedimento é o **signature element** (a única ousadia). Badge do pai discreto no topo (eyebrow), progresso como chip silencioso. Nada de gradiente/decoração extra.

- [ ] **Step 1: Estender `CardData`** — adicionar campos (após `type`):

```ts
  blocker?: "IMPEDIMENTO" | "AVISO" | null;
  parent?: { id: string; code: string | null; title: string } | null;
  children?: { id: string; column: { name: string } }[];
```

- [ ] **Step 2: Import** — na linha de import de colors, adicionar `BLOCKER`:

```ts
import { PRIORITY, CARD_TYPE, BLOCKER, avatarColor, initials, type Swatch } from "./colors";
```

E no import de lucide-react adicionar os ícones: `Ban, TriangleAlert, CornerLeftUp, CircleCheck`.

- [ ] **Step 3: Calcular derivados no topo de `CardView`** (após `const ty = ...`):

```ts
  const bl = card.blocker ? BLOCKER[card.blocker] : null;
  const kids = card.children ?? [];
  const kidsDone = kids.filter((k) => /(done|conclu)/i.test(k.column.name)).length;
```

- [ ] **Step 4: Aplicar a borda de bloqueio** — trocar o `className` do `<div>` raiz do CardView para incluir a borda condicional e mudar `border` default; e adicionar `style` com a cor da borda:

```tsx
    <div
      className={
        "flex flex-col gap-2.5 rounded-lg bg-card p-3 text-card-foreground hover:border-foreground/20 " +
        (bl ? "border-l-4 " : "border ") +
        (dragging ? "shadow-lg" : "shadow-sm")
      }
      style={bl ? { borderColor: bl.border, borderLeftColor: bl.border } : undefined}
    >
```

- [ ] **Step 5: Badge do pai (eyebrow no topo)** — inserir ANTES do `<div className="text-sm leading-snug">` do título:

```tsx
      {card.parent ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CornerLeftUp className="size-3 shrink-0" />
          <span className="truncate">
            {card.parent.code ? `${card.parent.code} · ` : ""}{card.parent.title}
          </span>
        </div>
      ) : null}
```

- [ ] **Step 6: Badge de bloqueio + progresso** — dentro da `<div className="flex flex-wrap items-center gap-2">`, após o badge de versão, antes do bloco de comentários:

```tsx
        {bl ? (
          <Badge
            variant="secondary"
            className="gap-1 border-transparent font-medium"
            style={{ background: bl.bg, color: bl.text }}
          >
            {card.blocker === "IMPEDIMENTO" ? <Ban className="size-3" /> : <TriangleAlert className="size-3" />}
            {bl.label}
          </Badge>
        ) : null}
        {kids.length > 0 ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CircleCheck className="size-3" /> {kidsDone}/{kids.length}
          </span>
        ) : null}
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/components/board/Card.tsx
git commit -m "feat(ui): card do board mostra pai, bloqueio (borda+badge) e progresso de subtarefas"
```

---

### Task 7: CardDrawer — impedimento, link pai, seção subtarefas

**Files:**
- Modify: `src/components/board/CardDrawer.tsx` (CardDetail `:41-57`, TYPE_OPTS `:75-80`, corpo)

**Interfaces:**
- Consumes: API PATCH (Task 3), POST /api/cards (existente), `BLOCKER`.
- Produces: UI de edição de blocker; navegação pro pai; criar/abrir subtarefas.

Recebe uma nova prop `onOpen?: (id: string) => void` (pra abrir pai/filho no mesmo drawer trocando `openCard`). Ver Task 8 pra ligar em BoardApp.

- [ ] **Step 1: Estender `CardDetail`** — adicionar (após `type`):

```ts
  blocker: "IMPEDIMENTO" | "AVISO" | null;
  blockerReason: string | null;
  parent: { id: string; code: string | null; title: string } | null;
  children: { id: string; code: string | null; title: string; type: string | null; column: { name: string } }[];
```

- [ ] **Step 2: Ajustar `getCard`/include** — em `cards.ts`, `getCard` usa `cardInclude` (já traz parent/children resumidos da Task 2), MAS a seção de subtarefas precisa de `code`, `title`, `type` dos filhos. Estender o `children` select DENTRO de `getCard` (sobrescrevendo o do include) para:

```ts
      children: {
        select: { id: true, code: true, title: true, type: true, column: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
```

(Adicionar essa chave ao objeto `include` de `getCard`, após `attachments`.)

Run: `npx tsc --noEmit` — Expected: sem erros.

- [ ] **Step 3: TYPE_OPTS + imports** — adicionar `{ v: "SUBTASK", label: "Subtask" }` ao array `TYPE_OPTS`. No import lucide, adicionar `Ban, TriangleAlert, ListTree, CornerLeftUp`. Importar `BLOCKER` de `./colors`.

- [ ] **Step 4: Prop onOpen** — na assinatura do componente `CardDrawer({...})` adicionar `onOpen`:

```tsx
export function CardDrawer({ cardId, columns, users, currentUser, onClose, onChanged, onArchive, onOpen }: {
  // ...tipos existentes...
  onOpen?: (id: string) => void;
}) {
```

- [ ] **Step 5: Row de Impedimento** — inserir uma nova `<Row>` após a Row "Prazo" (linha ~518):

```tsx
              <Row icon={Ban} label="Bloqueio">
                <div className="flex flex-col gap-2">
                  <Select
                    value={card.blocker ?? "none"}
                    onValueChange={(v) => patch({ blocker: v === "none" ? null : v, ...(v === "none" ? { blockerReason: null } : {}) })}
                  >
                    <SelectTrigger size="sm" className="w-44 border-0 bg-transparent shadow-none hover:bg-accent"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">Sem bloqueio</SelectItem>
                        <SelectItem value="IMPEDIMENTO">🚫 Impedimento</SelectItem>
                        <SelectItem value="AVISO">⚠️ Aviso</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {card.blocker ? (
                    <textarea
                      defaultValue={card.blockerReason ?? ""}
                      placeholder="Motivo do bloqueio…"
                      rows={2}
                      onBlur={(e) => { if ((e.target.value || null) !== card.blockerReason) patch({ blockerReason: e.target.value || null }); }}
                      className="w-full resize-y rounded-md bg-muted/40 p-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                    />
                  ) : null}
                </div>
              </Row>
```

- [ ] **Step 6: Link do card pai** — inserir uma `<Row>` após a Row "Chave" (para dar contexto cedo), só quando houver pai:

```tsx
              {card.parent ? (
                <Row icon={CornerLeftUp} label="Card pai">
                  <button
                    onClick={() => onOpen?.(card.parent!.id)}
                    className={inlineField + " flex items-center gap-1.5 text-left"}
                  >
                    <span className="truncate">
                      {card.parent.code ? `${card.parent.code} · ` : ""}{card.parent.title}
                    </span>
                  </button>
                </Row>
              ) : null}
```

- [ ] **Step 7: Seção Subtarefas** — inserir um bloco novo entre a Descrição e o `<Separator />` que precede Comentários (após o fechamento da div de descrição, linha ~623). Inclui estado local pro formulário:

Adicionar estados no topo do componente (junto aos outros `useState`):

```tsx
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subType, setSubType] = useState<"SUBTASK" | "BUG">("SUBTASK");
```

Função de criar (junto às outras async fns):

```tsx
  async function createSubtask() {
    if (!cardId || !subTitle.trim()) return;
    const firstCol = columns[0]?.id;
    const res = await fetch("/api/cards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId: firstCol, title: subTitle, type: subType, parentId: cardId }),
    });
    if (!res.ok) { toast.error("Falha ao criar subtarefa"); return; }
    setSubTitle(""); setAddingSub(false);
    await qc.invalidateQueries({ queryKey: ["card", cardId] });
    onChanged();
  }
```

JSX da seção:

```tsx
            <Separator />
            <div className="flex flex-col gap-2 px-8 py-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ListTree className="size-4" /> Subtarefas
                  {card.children.length > 0 ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {card.children.filter((k) => /(done|conclu)/i.test(k.column.name)).length}/{card.children.length}
                    </span>
                  ) : null}
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setAddingSub((v) => !v)}>
                  <Plus className="size-3.5" /> Adicionar
                </Button>
              </div>

              {card.children.map((k) => {
                const kty = k.type ? CARD_TYPE[k.type] : null;
                return (
                  <button
                    key={k.id}
                    onClick={() => onOpen?.(k.id)}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm hover:border-foreground/20"
                  >
                    {kty ? (
                      <Badge variant="secondary" className="border-transparent font-medium" style={{ background: kty.bg, color: kty.text }}>
                        {kty.label}
                      </Badge>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {k.code ? <span className="text-muted-foreground">{k.code} · </span> : null}{k.title}
                    </span>
                    <Badge variant="secondary" className="border-transparent" style={{ background: columnSwatch(k.column.name).bg, color: columnSwatch(k.column.name).text }}>
                      {k.column.name}
                    </Badge>
                  </button>
                );
              })}

              {addingSub ? (
                <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
                  <div className="flex gap-1">
                    <Button variant={subType === "SUBTASK" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setSubType("SUBTASK")}>Subtask</Button>
                    <Button variant={subType === "BUG" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setSubType("BUG")}>Bug</Button>
                  </div>
                  <input
                    autoFocus
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createSubtask(); if (e.key === "Escape") setAddingSub(false); }}
                    placeholder="Título da subtarefa…"
                    className="w-full rounded-md bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setAddingSub(false); setSubTitle(""); }}>Cancelar</Button>
                    <Button size="sm" onClick={createSubtask} disabled={!subTitle.trim()}>Criar</Button>
                  </div>
                </div>
              ) : card.children.length === 0 ? (
                <span className="text-sm text-muted-foreground">Nenhuma subtarefa.</span>
              ) : null}
            </div>
```

Nota: `columnSwatch` e `CARD_TYPE` já são/serão importados — garantir os dois no import de `./colors` (`columnSwatch` já está; adicionar `CARD_TYPE`).

- [ ] **Step 8: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/components/board/CardDrawer.tsx src/server/cards.ts
git commit -m "feat(ui): drawer com bloqueio, link do pai e seção de subtarefas"
```

---

### Task 8: Ligar onOpen do drawer + CardDialog SUBTASK

**Files:**
- Modify: `src/components/board/BoardApp.tsx:122-130`
- Modify: `src/components/board/CardDialog.tsx:125-135`

**Interfaces:**
- Consumes: prop `onOpen` do CardDrawer (Task 7).
- Produces: navegação pai↔filho funcional; criação com tipo SUBTASK no dialog.

- [ ] **Step 1: Passar `onOpen` ao CardDrawer** em BoardApp — o drawer já tem `setOpenCard`:

```tsx
      <CardDrawer
        cardId={openCard}
        columns={columns}
        users={users}
        currentUser={currentUser}
        onClose={() => setOpenCard(null)}
        onChanged={refetch}
        onArchive={archiveCard}
        onOpen={setOpenCard}
      />
```

- [ ] **Step 2: CardDialog SUBTASK** — adicionar item ao Select de tipo (após BUG/FEATURE/TAREFA):

```tsx
                  <SelectItem value="SUBTASK">Subtask</SelectItem>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/board/BoardApp.tsx src/components/board/CardDialog.tsx
git commit -m "feat(ui): navegação pai/filho no drawer + tipo SUBTASK no novo card"
```

---

### Task 9: Verificação end-to-end

**Files:** nenhum (validação).

- [ ] **Step 1: Suite completa**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: tudo verde.

- [ ] **Step 2: Verificar no app (skill `verify`)** — subir o app (`npm run db:up` + `npm run dev`), então via browser (Playwright MCP):
  1. Criar um card pai.
  2. Abrir o card → seção Subtarefas → Adicionar → tipo Bug → título → Criar. Confirmar que o filho aparece na coluna "A Fazer" com badge do pai (`↖ code · título`).
  3. No filho, badge de tipo Bug visível.
  4. No pai, chip de progresso `0/1`. Mover o filho pra coluna Done/Concluído → pai vira `1/1`.
  5. No card pai, setar Bloqueio = Impedimento + motivo → confirmar borda vermelha + badge 🚫 no board.
  6. Trocar pra Aviso → borda âmbar + badge ⚠️.
  7. Clicar no link "Card pai" dentro do filho → drawer troca pro pai.

- [ ] **Step 3: Commit final (se houver ajuste do verify)**

```bash
git add -A && git commit -m "test: ajustes do verify e2e de subtarefas/impedimentos"
```

---

## Self-Review

**1. Spec coverage:**
- Subtask/Bug via parentId → Tasks 1,2,7,8. ✓
- Impedimento/Aviso + motivo → Tasks 1,2,5,6,7. ✓
- Board mostra pai do filho → Task 6 (badge eyebrow). ✓
- Progresso no pai (X/Y) → Tasks 2,6,7. ✓
- MCP expõe tudo → Task 4. ✓
- Criação na 1ª coluna → Task 7 (`columns[0]`). ✓

**2. Placeholder scan:** sem TBD/TODO; todo passo de código tem o código. ✓

**3. Type consistency:**
- `parent: {id,code,title}` idêntico em CardData (T6) e CardDetail (T7) e cardInclude (T2). ✓
- `children` resumido (`{id,column:{name}}`) no board (T2/T6); detalhado (`+code,title,type`) só em getCard/CardDrawer (T7 Step 2) — divergência intencional e documentada. ✓
- `done` = regex `/(done|conclu)/i` usado igual em Card.tsx (T6) e CardDrawer (T7). ✓
- `blocker` valores `"IMPEDIMENTO"|"AVISO"` consistentes em enum, colors, CardData, CardDetail. ✓
