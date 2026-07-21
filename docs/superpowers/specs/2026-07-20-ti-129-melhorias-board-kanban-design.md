# TI-129 — Melhorias no Board Kanban

**Data:** 2026-07-20
**Card:** TI-129 (FEATURE, prio MEDIA)
**Branch:** `feature/TI-129-melhorias-board-kanban`

Conjunto de 4 melhorias de usabilidade no board kanban. Escopo fechado: os 4 itens
num único design/PR.

## Contexto do código (estado atual)

- **Schema:** `prisma/schema.prisma:46-76` — model `Card`; `code` é `String?` (nullable), linha 50.
- **Criação:** `src/server/cards.ts:216` `createCard()`. Linha 224 já atribui code sempre:
  `input.code?.trim() ? input.code.trim() : await nextCardCode()`.
- **Geração de code:** `src/server/cards.ts:63` `nextCardCode()` — hoje baseado em `max(sufixo numérico)+1`
  sobre todos os cards com prefixo `TI-` (inclui arquivados).
- **UI criação:** `src/components/board/CardDialog.tsx` — form sem campo de code.
- **Header:** `src/components/board/Chrome.tsx:59` `<header>` — não é sticky.
- **Drawer:** `src/components/board/CardDrawer.tsx` — code inline (368-375), details textarea (640-666).
  Sem campo "Documentação".
- **Rotas:** `src/app/api/cards/route.ts` (POST/GET), `src/app/api/cards/[id]/route.ts` (PATCH/GET/DELETE).
- **Types:** `src/server/types.ts:11-28` `CreateCardInput`.

Achado-chave: **a criação já garante code**. Cards com `code:null` são legados (anteriores à
lógica atual / seed). Portanto item 4 = backfill dos legados, não mudança no fluxo de criação.

---

## Item 4 — Todo card com chave (backfill dos null)

**Objetivo:** eliminar cards com `code:null`; garantir chave daqui pra frente (já ocorre na prática).

**Decisão:** só backfill. Schema segue `String?` (evita risco de quebrar seed/import que
dependam de nullable). A garantia forte vem do counter atômico (item 1), que remove a única
forma real de escapar (colisão/corrida).

**Design:**
- Migration data-only: para cada card com `code=null`, atribuir `TI-N` sequencial continuando
  do maior número existente (considerando arquivados, como `nextCardCode`). Ordem estável
  (ex.: por `createdAt asc`) para determinismo.
- Rodar via `DIRECT_URL` (não pooler) — convenção do repo p/ migrations (commit #22).

**Teste:** dado cards com code null, após backfill todos têm `TI-N` único, sem colidir com
existentes; cards que já tinham code não mudam.

---

## Item 1 — Reservar a chave na criação (prévia + copiar)

**Objetivo:** mostrar a chave do card já ao criar, com botão copiar, e que a chave mostrada
seja a **final** (não muda depois).

**Decisão:** reservar a chave de verdade antes de salvar. Cancelar **libera** a chave
(compare-and-decrement: só devolve se ainda for a última emitida). Se outro card avançou
o contador no meio, o furo permanece — aceito.

**Ajuste pós-teste (release ao cancelar):**
- `releaseCardCode(code)` em `cards.ts`: `db.counter.updateMany({ where:{ name:"card", value:n }, data:{ value:{ decrement:1 } } })` — só decrementa se o contador ainda estiver em `n` (atômico, sem corrida).
- `POST /api/cards/release-code` (auth-gated) chama `releaseCardCode`.
- `CardDialog`: no unmount, se não criou e há chave reservada, chama `release-code` com `keepalive`. `createdRef` marca criação bem-sucedida (não libera nesse caso).

**Design:**
- Novo model `Counter { id, name String @unique, value Int }` — linha única `name:"card"`.
  Migration cria a tabela e seeda `value` = maior número `TI-` atual (após o backfill do item 4,
  para os dois itens ficarem consistentes num só ponto).
- `nextCardCode()` refatorado: em vez de `max()+1`, faz incremento atômico
  `db.counter.update({ where:{ name:"card" }, data:{ value:{ increment:1 } } })` e retorna
  `TI-${value}`. Elimina colisão por corrida (dois creates simultâneos). É a fonte única do
  sequencial — usada tanto pela reserva quanto pelo fallback do `createCard` (ex.: MCP sem code).
- `POST /api/cards/reserve-code` → chama `nextCardCode()` (consome 1) e retorna `{ code }`.
- `CardDialog`:
  - Ao **abrir**, chama `reserve-code`; guarda `reservedCode` no estado; exibe a chave (readonly)
    + botão copiar (clipboard).
  - No **save**, envia `code: reservedCode` no POST. `createCard` já usa `input.code` quando presente.
  - Reabrir o dialog reserva de novo (gap possível) — aceito.

**Trade-off explícito:** furos no sequencial ao cancelar/reabrir. Aceito pelo usuário.

**Teste:** `reserve-code` retorna codes estritamente crescentes e distintos em chamadas
concorrentes; criar card com code reservado persiste exatamente aquela chave; `nextCardCode`
não repete sob concorrência.

---

## Item 3 — Campo Documentação

**Objetivo:** campo dedicado a links/documentação, separado das notas/details.

**Decisão:** texto multilinha em markdown (não lista estruturada).

**Design:**
- Migration: coluna `documentation String?` no `Card`.
- `CreateCardInput` / `UpdateCardInput` (`src/server/types.ts`): novo campo opcional
  `documentation`. `createCard`/`updateCard` persistem.
- `CardDrawer`: nova seção "Documentação" — textarea markdown (mesmo padrão de `details`,
  ~640-666), salva via PATCH existente (`patch()`), auto-save/blur como os demais campos.
- Tools MCP (`create_card`/`update_card` no server MCP): expor `documentation`.

**Teste:** CRUD de `documentation` via API PATCH e via MCP; drawer renderiza e persiste.

---

## Item 2 — Header sticky

**Objetivo:** cabeçalho do board fixo no scroll; ações sempre acessíveis com muitos cards.

**Design:**
- `Chrome.tsx:59` `<header>` → adicionar `sticky top-0 z-40` + background sólido (evita
  transparência sobre os cards ao rolar).
- Confirmar que o container de scroll é a página (body), não uma div interna — se o scroll for
  numa div, o `sticky top-0` ancora nela (ainda ok); validar visualmente.

**Teste:** manual/visual — rolar board com muitos cards, header permanece no topo; sem
sobreposição transparente.

---

## Ordem de implementação

1. Migration única: cria `Counter`, backfill de codes null, seeda counter no max final.
   (itens 4 + base do 1)
2. `nextCardCode()` → counter atômico; `reserve-code` endpoint. (item 1 backend)
3. `documentation` no schema/types/services/MCP. (item 3 backend)
4. `CardDialog` reserva + copiar. (item 1 frontend)
5. `CardDrawer` seção Documentação. (item 3 frontend)
6. `Chrome` sticky. (item 2)

## Fora de escopo

- Lista estruturada de links (label+url) — item 3 fica em markdown puro.
- `code` NOT NULL / unique constraint no schema — mantido nullable; garantia via counter atômico.
- Redesenho maior do header ou do drawer.

## Riscos

- **Furos no sequencial** (item 1) — aceito.
- **Migration em produção** — usar `DIRECT_URL`; backfill idempotente (só toca `code=null`).
- **Container de scroll do header** (item 2) — validar visualmente qual elemento rola.
