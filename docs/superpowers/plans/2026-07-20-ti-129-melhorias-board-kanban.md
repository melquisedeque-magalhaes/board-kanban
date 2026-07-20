# TI-129 — Melhorias no Board Kanban — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar 4 melhorias de usabilidade no board kanban: backfill de chaves null, reserva de chave na criação, campo Documentação e header sticky.

**Architecture:** Backend em `src/server/cards.ts` (Prisma) e rotas Next em `src/app/api`. Chave sequencial passa a vir de um contador atômico (`Counter`) em vez de `max()+1`, servindo tanto a reserva na criação quanto o fallback. Frontend em componentes React client (`CardDialog`, `CardDrawer`, `Chrome`).

**Tech Stack:** Next 16, React 19, Prisma 7 (adapter-pg, Postgres), Vitest (env node, DB mockado), Tailwind v4, shadcn/radix, sonner (toasts), lucide-react (ícones).

## Global Constraints

- Testes: `npm test` (= `vitest run`), ambiente `node`, DB **mockado** via `vi.mock("@/lib/db")` ou `vi.mock("@/server/cards")`. Não há testing-library/jsdom → tarefas de UI validam por `npx tsc --noEmit` + `npm run lint` + verificação manual, não por teste automatizado.
- Migrations: rodar com **`DIRECT_URL`** (conexão direta, não o pooler) — convenção do repo (commit #22). Comando: `npx prisma migrate dev`.
- Prefixo de chave: `TI-` (constante `CARD_CODE_PREFIX` em `src/server/cards.ts:59`).
- `code` no schema permanece `String?` (nullable) — decisão da spec (só backfill).
- MCP: `src/mcp/server.test.ts` exige **exatamente 17 tools**. Não criar tool nova; `documentation` entra nas tools `create_card`/`update_card` existentes.
- Commits frequentes, um por task. Mensagens em pt-BR, escopo `TI-129`.

---

### Task 1: Migration — Counter + documentation + backfill

Cria o model `Counter`, adiciona a coluna `documentation` no `Card`, faz backfill das chaves null e seeda o contador no maior número atual. Tudo numa migration.

**Files:**
- Modify: `prisma/schema.prisma:46-76` (Card: add `documentation`) e fim do arquivo (add model `Counter`)
- Create: `prisma/migrations/<timestamp>_ti129_counter_docs_backfill/migration.sql`

**Interfaces:**
- Produces: tabela `Counter(id, name unique, value int)` com linha `name="card"` seedada; coluna `Card.documentation text null`; zero cards com `code IS NULL`.

- [ ] **Step 1: Editar o schema Prisma**

Em `prisma/schema.prisma`, no model `Card`, após a linha `details String? @db.Text` (linha 52), adicionar:

```prisma
  documentation String?   @db.Text
```

No fim do arquivo, adicionar o model:

```prisma
model Counter {
  id    String @id @default(cuid())
  name  String @unique
  value Int
}
```

- [ ] **Step 2: Gerar a migration sem aplicar (para editar o SQL)**

Run: `npx prisma migrate dev --name ti129_counter_docs_backfill --create-only`
Expected: cria a pasta `prisma/migrations/<timestamp>_ti129_counter_docs_backfill/` com `migration.sql` contendo `CREATE TABLE "Counter"` e `ALTER TABLE "Card" ADD COLUMN "documentation"`.

- [ ] **Step 3: Acrescentar backfill + seed ao migration.sql**

Ao **final** do `migration.sql` gerado, acrescentar (o backfill roda antes do seed para o contador já refletir as chaves novas):

```sql
-- Backfill: cards sem chave recebem TI-N sequencial, continuando do maior número atual.
WITH mx AS (
  SELECT COALESCE(MAX(CAST(SUBSTRING("code" FROM 4) AS INTEGER)), 0) AS m
  FROM "Card"
  WHERE "code" ~ '^TI-[0-9]+$'
),
numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Card"
  WHERE "code" IS NULL
)
UPDATE "Card" c
SET "code" = 'TI-' || (mx.m + n.rn)
FROM numbered n, mx
WHERE c."id" = n."id";

-- Seed do contador no maior número já existente (inclui os recém-preenchidos).
INSERT INTO "Counter" ("id", "name", "value")
SELECT 'counter_card', 'card',
       COALESCE(MAX(CAST(SUBSTRING("code" FROM 4) AS INTEGER)), 0)
FROM "Card"
WHERE "code" ~ '^TI-[0-9]+$';
```

- [ ] **Step 4: Aplicar a migration**

Run: `npx prisma migrate dev` (usa `DIRECT_URL`)
Expected: migration aplicada sem erro; `prisma generate` roda (tipos `Counter` e `Card.documentation` disponíveis).

- [ ] **Step 5: Verificar (é o "teste" desta task)**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT (SELECT count(*) FROM "Card" WHERE "code" IS NULL) AS nulls,
       (SELECT value FROM "Counter" WHERE name='card') AS counter_value,
       (SELECT count(DISTINCT "code") FROM "Card" WHERE "code" IS NOT NULL) AS distinct_codes,
       (SELECT count(*) FROM "Card" WHERE "code" IS NOT NULL) AS total_coded;
SQL
```
Expected: `nulls = 0`; `distinct_codes = total_coded` (sem duplicata); `counter_value` = maior N das chaves.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(TI-129): migration Counter + documentation + backfill de chaves null"
```

---

### Task 2: nextCardCode via contador atômico

Troca a geração `max()+1` por incremento atômico no `Counter`, eliminando colisão por corrida. `createCard` continua funcionando (usa `nextCardCode` no fallback).

**Files:**
- Modify: `src/server/cards.ts:63-73` (`nextCardCode`)
- Test: `src/server/cards.test.ts` (novo)

**Interfaces:**
- Consumes: `db.counter.update` (Task 1).
- Produces: `nextCardCode(): Promise<string>` — retorna `TI-${value}` de um incremento atômico. Assinatura inalterada.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/server/cards.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const counterUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { counter: { update: (...a: unknown[]) => counterUpdate(...a) } },
}));

import { nextCardCode } from "./cards";

describe("nextCardCode", () => {
  beforeEach(() => counterUpdate.mockReset());

  it("incrementa o contador atômico e formata TI-N", async () => {
    counterUpdate.mockResolvedValue({ value: 130 });
    const code = await nextCardCode();
    expect(code).toBe("TI-130");
    expect(counterUpdate).toHaveBeenCalledWith({
      where: { name: "card" },
      data: { value: { increment: 1 } },
      select: { value: true },
    });
  });

  it("chamadas sequenciais devolvem valores distintos do contador", async () => {
    counterUpdate.mockResolvedValueOnce({ value: 1 }).mockResolvedValueOnce({ value: 2 });
    expect(await nextCardCode()).toBe("TI-1");
    expect(await nextCardCode()).toBe("TI-2");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/cards.test.ts`
Expected: FAIL — `nextCardCode` ainda chama `db.card.findMany` (não mockado) e/ou não chama `counter.update`.

- [ ] **Step 3: Implementar**

Substituir `nextCardCode` (`src/server/cards.ts:61-73`) por:

```ts
// Próxima Chave sequencial global (TI-1, TI-2, …) via contador atômico:
// um único UPDATE ... increment garante que dois creates simultâneos nunca
// recebam o mesmo número. O contador é seedado pela migration no maior N atual.
export async function nextCardCode(): Promise<string> {
  const { value } = await db.counter.update({
    where: { name: "card" },
    data: { value: { increment: 1 } },
    select: { value: true },
  });
  return `${CARD_CODE_PREFIX}${value}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/server/cards.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Rodar a suíte inteira (não regrediu MCP)**

Run: `npm test`
Expected: todos passam, incluindo `src/mcp/server.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/server/cards.ts src/server/cards.test.ts
git commit -m "feat(TI-129): nextCardCode via contador atômico (sem colisão por corrida)"
```

---

### Task 3: Endpoint reserve-code

Rota que consome uma chave e devolve o código reservado, para o dialog exibir a chave final antes de salvar.

**Files:**
- Create: `src/app/api/cards/reserve-code/route.ts`
- Test: `src/app/api/cards/reserve-code/route.test.ts`

**Interfaces:**
- Consumes: `nextCardCode()` (Task 2), `requireUser()` (`src/server/auth-guard.ts`, padrão já usado em `src/app/api/cards/route.ts:3`).
- Produces: `POST /api/cards/reserve-code` → `200 { code: string }`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/app/api/cards/reserve-code/route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/cards", () => ({ nextCardCode: vi.fn().mockResolvedValue("TI-131") }));

import { POST } from "./route";

describe("POST /api/cards/reserve-code", () => {
  it("reserva e devolve o próximo code", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "TI-131" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/cards/reserve-code/route.test.ts`
Expected: FAIL — `./route` não existe.

- [ ] **Step 3: Implementar a rota**

Create `src/app/api/cards/reserve-code/route.ts`:

```ts
import { NextResponse } from "next/server";
import { nextCardCode } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

// Reserva a próxima chave (consome do contador). Usado pelo dialog de criação
// para mostrar a chave final antes de salvar. Cancelar deixa um furo no
// sequencial — comportamento aceito (ver spec TI-129).
export async function POST() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const code = await nextCardCode();
  return NextResponse.json({ code });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/cards/reserve-code/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cards/reserve-code
git commit -m "feat(TI-129): endpoint POST /api/cards/reserve-code"
```

---

### Task 4: Campo documentation (types + services + MCP)

Propaga `documentation` pela camada de dados e pelas tools MCP.

**Files:**
- Modify: `src/server/types.ts:11-45` (add `documentation` em Create/Update)
- Modify: `src/server/cards.ts:226-239` (createCard data) e `src/server/cards.ts:255-265` (updateCard data)
- Modify: `src/mcp/server.ts:50-70` (create_card inputSchema) e `src/mcp/server.ts:84-100` (update_card inputSchema)
- Test: `src/server/cards.test.ts` (append)

**Interfaces:**
- Consumes: `CreateCardInput`/`UpdateCardInput`.
- Produces: `createCard`/`updateCard` persistem `documentation`; tools MCP aceitam `documentation`.

- [ ] **Step 1: Escrever o teste que falha (append em cards.test.ts)**

Adicionar ao `src/server/cards.test.ts` (ampliar o mock de `@/lib/db` no topo para incluir `card.create`/`resolve*` helpers). Substituir o bloco `vi.mock("@/lib/db"...)` por:

```ts
const counterUpdate = vi.fn();
const cardCreate = vi.fn().mockResolvedValue({ id: "new" });
vi.mock("@/lib/db", () => ({
  db: {
    counter: { update: (...a: unknown[]) => counterUpdate(...a) },
    card: {
      create: (...a: unknown[]) => cardCreate(...a),
      findMany: vi.fn().mockResolvedValue([]),
    },
    column: { findFirst: vi.fn().mockResolvedValue({ id: "col1" }) },
  },
}));
```

E adicionar o teste:

```ts
import { createCard } from "./cards";

describe("createCard documentation", () => {
  it("persiste o campo documentation", async () => {
    counterUpdate.mockResolvedValue({ value: 5 });
    cardCreate.mockClear();
    await createCard({ columnName: "A Fazer", title: "x", documentation: "- [doc](http://a)" });
    expect(cardCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentation: "- [doc](http://a)" }),
      }),
    );
  });
});
```

> Nota: `createCard` chama `resolveColumnId`, `resolveUserIds`, `resolveLabelIds`, `resolveUserId` e `positionBetween`. Esses usam `db.column`/`db.card`/`db.user`/`db.label`. Se o teste quebrar por método de `db` não mockado, adicione o método faltante ao mock com `vi.fn().mockResolvedValue([])` (arrays vazios) — o objetivo é só verificar o `data.documentation` repassado ao `card.create`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/server/cards.test.ts`
Expected: FAIL — `documentation` não aparece no `data` passado a `card.create`.

- [ ] **Step 3: Implementar — types**

Em `src/server/types.ts`, no `CreateCardInput` (após `code?: string;`, linha 22) adicionar:

```ts
  documentation?: string;
```

No `UpdateCardInput` (após `code?: string | null;`, linha 38) adicionar:

```ts
  documentation?: string | null;
```

- [ ] **Step 4: Implementar — services**

Em `src/server/cards.ts`, no `createCard` → objeto `data` (linha 228), adicionar após `details: input.details ?? input.description,`:

```ts
      documentation: input.documentation,
```

No `updateCard` → objeto `data` (linha 258), adicionar após a linha de `details`:

```ts
      documentation: input.documentation,
```

- [ ] **Step 5: Implementar — MCP schemas**

Em `src/mcp/server.ts`, no `create_card` inputSchema, após `details: z.string()...` (linha 55) adicionar:

```ts
        documentation: z.string().optional().describe("Links e documentação do card (markdown)"),
```

No `update_card` inputSchema, após `details: z.string().nullable()...` (linha 88) adicionar:

```ts
        documentation: z.string().nullable().optional().describe("Links e documentação (markdown; null limpa)"),
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: PASS — `cards.test.ts` novo teste passa; `src/mcp/server.test.ts` segue com 17 tools (não criamos tool nova).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/server/types.ts src/server/cards.ts src/mcp/server.ts src/server/cards.test.ts
git commit -m "feat(TI-129): campo documentation em types, services e tools MCP"
```

---

### Task 5: CardDialog — reserva de chave + copiar

Ao abrir o dialog, reserva a chave e a exibe (readonly) com botão copiar; no save envia o code reservado.

**Files:**
- Modify: `src/components/board/CardDialog.tsx`

**Interfaces:**
- Consumes: `POST /api/cards/reserve-code` (Task 3) → `{ code }`.
- Produces: dialog envia `code` no POST `/api/cards`.

> Sem teste automatizado (não há RTL/jsdom). Verificação: `tsc`, `lint`, manual.

- [ ] **Step 1: Import do ícone de copiar**

No topo de `src/components/board/CardDialog.tsx`, após os imports existentes, adicionar:

```tsx
import { Copy, Check } from "lucide-react";
```

- [ ] **Step 2: Estado + reserva ao abrir**

Após `const [confirmClear, setConfirmClear] = useState(false);` (linha 40) adicionar:

```tsx
  const [reservedCode, setReservedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reserva a chave uma vez, ao abrir o dialog. Cancelar deixa furo no
  // sequencial (aceito — ver spec TI-129).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/cards/reserve-code", { method: "POST" });
        if (alive && r.ok) setReservedCode((await r.json()).code);
      } catch { /* offline — cria sem prévia, backend gera no create */ }
    })();
    return () => { alive = false; };
  }, []);

  async function copyCode() {
    if (!reservedCode) return;
    try {
      await navigator.clipboard.writeText(reservedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard bloqueado */ }
  }
```

- [ ] **Step 3: Enviar o code no save**

Em `save()`, no corpo do POST (linha 63-69), adicionar `code` ao objeto JSON:

```tsx
      body: JSON.stringify({
        columnId, title,
        code: reservedCode || undefined,
        priority: priority || undefined,
        type: type || undefined,
        version: version.trim() || undefined,
        requestedBy: requestedBy || undefined,
      }),
```

- [ ] **Step 4: Exibir a chave no formulário**

Dentro do `<FieldGroup>`, como **primeiro** filho (antes do `<Field>` do Título, linha 85), adicionar:

```tsx
          {reservedCode && (
            <Field>
              <FieldLabel>Chave</FieldLabel>
              <div className="flex items-center gap-2">
                <Input value={reservedCode} readOnly className="font-mono" />
                <Button
                  type="button" variant="outline" size="icon"
                  onClick={copyCode} aria-label="Copiar chave"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </Field>
          )}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

Manual: abrir o board → "New" → o dialog mostra "Chave: TI-N" readonly + botão copiar; criar → o card nasce com essa chave.

- [ ] **Step 6: Commit**

```bash
git add src/components/board/CardDialog.tsx
git commit -m "feat(TI-129): CardDialog reserva e exibe a chave com botão copiar"
```

---

### Task 6: CardDrawer — seção Documentação

Nova seção editável (textarea markdown) que persiste `documentation` via PATCH.

**Files:**
- Modify: `src/components/board/CardDrawer.tsx`

**Interfaces:**
- Consumes: `patch({ documentation })` (já existe, `CardDrawer.tsx:186`), `CardDetail` type.
- Produces: seção "Documentação" no drawer.

> Sem teste automatizado. Verificação: `tsc`, `lint`, manual.

- [ ] **Step 1: Adicionar documentation ao tipo CardDetail**

Em `src/components/board/CardDrawer.tsx`, no `interface CardDetail`, após `details: string | null;` (linha 46) adicionar:

```tsx
  documentation: string | null;
```

- [ ] **Step 2: Import do ícone**

No import de `lucide-react` (linhas 6-10), adicionar `BookText` à lista:

```tsx
  Package, UserPlus, ExternalLink, Ban, TriangleAlert, Wrench, ListTree, CornerLeftUp, BookText,
```

- [ ] **Step 3: Estado de edição + derivados**

Após `const [editingDetails, setEditingDetails] = useState(false);` (linha 131) adicionar:

```tsx
  const [editingDocs, setEditingDocs] = useState(false);
```

Após `const hasDesc = desc.trim().length > 0;` (linha 323) adicionar:

```tsx
  const docs = card?.documentation ?? "";
  const hasDocs = docs.trim().length > 0;
```

- [ ] **Step 4: Renderizar a seção**

Logo após o `</div>` que fecha a seção Descrição e o `<Separator />` seguinte (linha 702), inserir a nova seção **antes** da seção que começa em 704:

```tsx
            {/* Documentação (links/refs em markdown) */}
            <div className="flex flex-col gap-2 px-8 py-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <BookText className="size-4" /> Documentação
                </span>
                {hasDocs ? (
                  <Button
                    variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => setEditingDocs((v) => !v)}
                  >
                    {editingDocs ? <><Eye className="size-3.5" /> Visualizar</> : <><Pencil className="size-3.5" /> Editar</>}
                  </Button>
                ) : null}
              </div>

              {editingDocs || !hasDocs ? (
                <textarea
                  defaultValue={docs}
                  placeholder="Links e documentação em markdown (um por linha)…"
                  rows={4}
                  onBlur={(e) => { if ((e.target.value || null) !== card.documentation) patch({ documentation: e.target.value || null }); }}
                  className="min-h-24 w-full resize-y rounded-lg bg-muted/40 p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring [field-sizing:content]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDocs(true)}
                  className="cursor-text rounded-md p-3 text-left hover:bg-accent/50"
                >
                  <MarkdownView source={docs} />
                </button>
              )}
            </div>

            <Separator />
```

> `MarkdownView` e `patch` já existem no arquivo (linhas 103 e 186). O `card` é garantido não-nulo neste ponto do render (mesma região da seção Descrição).

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

Manual: abrir um card → seção "Documentação" aparece abaixo de Descrição; digitar markdown, sair do campo (blur) → persiste; reabrir mostra o conteúdo renderizado.

- [ ] **Step 6: Commit**

```bash
git add src/components/board/CardDrawer.tsx
git commit -m "feat(TI-129): seção Documentação no drawer do card"
```

---

### Task 7: Header sticky

Fixa o cabeçalho do board no topo ao rolar.

**Files:**
- Modify: `src/components/board/Chrome.tsx:59`

**Interfaces:** nenhuma (mudança de CSS).

> Sem teste automatizado. Verificação: `tsc`, `lint`, manual.

- [ ] **Step 1: Tornar o header sticky**

Em `src/components/board/Chrome.tsx`, trocar a abertura do header (linha 59):

```tsx
    <header className="flex flex-col">
```

por:

```tsx
    <header className="sticky top-0 z-40 flex flex-col bg-background">
```

> `bg-background` é necessário para o conteúdo não aparecer por baixo do header translúcido ao rolar. `z-40` fica abaixo da barra de scroll `fixed ... z-30`? Não — a barra de scroll horizontal é `z-30` no rodapé; o header `z-40` fica acima dos cards e não conflita com o rodapé.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

Manual: board com muitos cards (ou janela baixa) → rolar verticalmente; o header permanece fixo no topo, sem sobreposição translúcida. Confirmar que o scroll vertical é da página (window); se houver container interno com `overflow-y`, o `sticky top-0` ancora nele — validar visualmente.

- [ ] **Step 3: Commit**

```bash
git add src/components/board/Chrome.tsx
git commit -m "feat(TI-129): header do board sticky no scroll"
```

---

### Task 8: Fechamento

- [ ] **Step 1: Suíte completa + build**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: tudo verde.

- [ ] **Step 2: Atualizar o card no board**

Mover TI-129 para a coluna de teste/done conforme o fluxo, e/ou registrar `branchUrl`. (Via MCP `move_card` / `update_card` — decidir com o usuário ao integrar.)

- [ ] **Step 3: Abrir PR**

Push da branch `feature/TI-129-melhorias-board-kanban` e abrir PR contra `main`, com descrição cobrindo os 4 itens.

---

## Self-Review

**Spec coverage:**
- Item 1 (prévia/reserva) → Tasks 2, 3, 5. ✓
- Item 2 (header sticky) → Task 7. ✓
- Item 3 (documentação) → Tasks 1, 4, 6. ✓
- Item 4 (backfill) → Task 1. ✓
- Counter atômico (base do item 1, spec) → Tasks 1, 2. ✓

**Type consistency:** `documentation` é `string?` no Prisma, `string | undefined` em `CreateCardInput`, `string | null | undefined` em `UpdateCardInput` e `CardDetail.documentation: string | null` — consistente com o padrão de `details`. `nextCardCode(): Promise<string>` inalterado. `reserve-code` retorna `{ code: string }`, consumido igual no dialog.

**Placeholders:** nenhum — todo step tem código/comando concreto.

**Ordem:** Task 1 (migration) precede 2 (usa Counter) e 4 (usa coluna documentation). 3 depende de 2. 5 depende de 3. 6 depende de 4. 7 independente. OK.
