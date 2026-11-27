---
item: TI-1210
gerado: 2026-11-26
base: main 8445972 (diff não commitado na worktree TI-1210)
---

# Validação — TI-1210 Lista de usuários

## Diagnóstico do problema 2 (antes da edição)

Harness Vite isolado (`.superpowers/harness-ti-1210/`, fora do Git), com o mesmo `radix-ui` (`@radix-ui/react-select` 2.3.1), os wrappers `src/components/ui/select.tsx`/`popover.tsx` e o CSS do app (`globals.css` com `@source src`). 16 usuários, filtro dentro de Popover como em `Chrome.tsx`. Re-render periódico simulado a cada 2 s (no app vem da presença, a cada 20 s, e do refetch do board quando a versão muda, com polling de 3 s). Medição: `scrollTop`/máximo do viewport do Select, no navegador embutido do Orca (Chromium).

| Modo | Re-render | Roda do mouse | Seta inferior |
|---|---|---|---|
| `item-aligned` (como estava) | não | 0 → 122/152, mantém | chega a 128/128, mantém |
| `item-aligned` (como estava) | a cada 2 s | **fica em 0** a cada passo | 178 → 128 → **0** no re-render |
| `popper` (correção) | a cada 2 s | 40 → 200/262, **mantém após 4,5 s** | 238/238, **mantém** por 4 s |

**Causa confirmada:** no `item-aligned`, o Radix passa `onPlaced` como arrow inline (`@radix-ui/react-select/dist/index.mjs:487`). Todo re-render recria o callback `position`, e o `useLayoutEffect` (`:638`) reaplica altura e `scrollTop` (`:613-618`). O modo `popper` não tem esse cálculo. Descartado: o `scrollIntoView` da seta superior (`:1035-1037`) não reproduziu sem re-render.

## Critérios de aceite

| AC | Evidência | Resultado |
|---|---|---|
| AC1 Responsável cabe na tela | Harness com as mesmas classes do `PopoverContent`. Viewport de 768 px, gatilho em y=300: **antes** bottom=1042 (passa da tela); **depois** top=337,9, bottom=759,9, rolagem interna ativa, página com `scrollTop`=0. Gatilho no fim (y=648): abre para cima, 8–644. Viewport de 600 px: 78–592,4 / 21,1–297,9 / 8–476, todos dentro. Screenshots: `evidence/ac1-antes.png`, `evidence/ac1-depois.png` | PASS (harness) |
| AC1b Solicitado por / Tester | Mesma constante `userListPopover` + `collisionPadding={8}` em `UserPickField` (`CardDrawer.tsx`) | PASS por construção, mesma classe medida |
| AC2 rolar não volta ao topo | Tabela acima, linha `popper`. `evidence/ac2-depois-4s.png` | PASS (harness) |
| AC3 seta desce sem voltar | Tabela acima, linha `popper`, seta inferior | PASS (harness) |
| AC4 seleção continua | Popper com re-render: rolar e clicar em "Usuário 11" → valor `u10`, gatilho "Usuário 11". O Popover de responsável mantém os mesmos `onClick` | PASS (harness) |

## Sensor de discriminação

Cada mudança foi revertida isoladamente no harness, e a medição detectou a reversão:

- Sem `max-h/overflow` → bottom=1042 > 768 (AC1 FAIL).
- Sem `collisionPadding` → borda encosta no fim da tela (bottom 768,x, `inside=false` com gatilho em y=40).
- `position` de volta a `item-aligned` → `scrollTop` volta a 0 a cada re-render (AC2/AC3 FAIL).

## Gates automáticos

- `npx eslint src/components/board/CardDrawer.tsx src/components/board/Chrome.tsx`: limpo.
- `npx tsc --noEmit`: limpo.
- `npm test`: 42 arquivos, 315 testes passaram, 3 skipped (já existentes).

## Revisão do diff

Diff de 2 arquivos (+9/−3), só classes e props de posicionamento. Sem mudança de lógica, dado ou contrato. As cores não mudaram, então o tema claro/escuro não é afetado (o fundo do popover continua `bg-popover`). A sintaxe `max-h-(--var)` já é usada no wrapper `ui/select.tsx`.

## Validação no app real (local, mockado)

Ambiente: `next dev --webpack` na worktree (porta 3210) + Postgres 16 descartável no Docker (`ti1210-pg`, porta 5433, migrations + seed) + Clerk em modo keyless (instância de desenvolvimento temporária, usuário de teste `+clerk_test`). Dados: 16 usuários mock + o usuário logado + `fusion-agents` = 18 na lista; 2 cards criados pelo MCP local. Navegador embutido do Orca (Chromium), tema escuro.

**AC1/AC1b (drawer do card TI-1)** — popover medido com `getBoundingClientRect`:

| Altura | Responsável | Solicitado por | Tester / QA |
|---|---|---|---|
| 768 | 310–760, abre para baixo | 350–760, abre para baixo | 8–370, abre para cima |
| 600 | 310–592, abre para baixo | 8–310, abre para cima | 8–370, abre para cima |

Em todos os casos a rolagem interna ficou ativa e o drawer e a página ficaram com `scrollTop`=0. **AC4:** rolei o popover até "Usuário Mock 16", cliquei e o chip apareceu no card; o banco confirma o vínculo (`_CardAssignees`: TI-1 → `mock-u16`). Evidência: `evidence/app-ac1-ac4-responsavel.png`.

**AC2/AC3 (filtro do kanban)** — mesmo teste, com e sem a correção (o `Chrome.tsx` foi revertido temporariamente e o patch reaplicado em seguida):

| Estado | Seta inferior | Roda do mouse |
|---|---|---|
| **Sem correção** (`item-aligned`) | chega a 402/402 aos 1,3 s, cai para 84 aos 1,5 s e **volta a 0 aos 2,5 s, logo depois do poll `board/version`** | 5 movimentos de 60 px: `scrollTop` **fica em 0** (o máximo alterna entre 342 e 402, sinal de que `position()` está rodando de novo) |
| **Com correção** (`popper`) | chega ao fim; 266 → 242 quando a seta superior aparece (24 px). **Mantém por 25 s**, com 7 polls `board/version` e 1 de presença | 0 → 60 → 180; **mantém 180 por 22 s** (mínimo 180), com 7 polls `board/version` e 1 de presença |

Com a correção, também mantém a posição durante o refetch real do board (`/api/columns`, disparado pela edição de um card pelo MCP em paralelo, com re-render do board confirmado por MutationObserver): `scrollTop` = 160 por 30 s. Ao filtrar por "Usuário Mock 16", o TI-1 aparece e o TI-2 some (AC4). Evidência: `evidence/app-ac2-filtro-depois.png`.

**Achado do diagnóstico:** o reset no app real não depende de outra pessoa mexer no board. O poll de versão (a cada 3 s) já basta para re-renderizar o select, então a lista volta ao topo em no máximo ~3 s.

## Pendências

| Pendência | Dono |
|---|---|
| Ambiente local de validação (container `ti1210-pg`, `.env`/`.env.local` com chaves temporárias do Clerk keyless, `.clerk/`) fica fora do Git. Remover depois da revisão. | Pedro |
| Corrigir o `package-lock.json` da `main`, fora de sincronia (`npm ci` falha por falta de `@emnapi/*`). Fora do escopo do TI-1210, e o lockfile não foi alterado. | time |

## Superfícies

Só a web. O board-kanban não tem app desktop nem worker.

## Ajuste pós-PR (2026-11-27): rolagem dos popovers dentro do drawer

**Relato (PRD):** no drawer do card, os selects de Responsável, Solicitado por e Tester/QA mostram a barra de rolagem, mas a roda do mouse não rola a lista. Se o drawer rolar com a lista aberta, a lista aumenta de altura acompanhando a rolagem.

**Causa:** o drawer é um `Dialog` do Radix (`Sheet`), que monta um `RemoveScroll` com `shards=[contentRef]` (`@radix-ui/react-dialog/dist/index.mjs:110`). O `PopoverContent` vai para um portal no `body`, fora do `SheetContent`, e o `react-remove-scroll` cancela o `wheel` de tudo que está fora do lock ativo. Com o drawer rolando, o gatilho se move e a altura livre (`--radix-popover-content-available-height`) é recalculada, então o `max-h` do commit anterior acompanha a rolagem.

**Correção (`CardDrawer.tsx`):** `<Popover modal>` nos dois popovers (o popover registra o próprio `RemoveScroll`, que passa a ser o lock ativo: a lista rola e o drawer fica parado enquanto ela está aberta) e teto fixo `max-h-[min(20rem,var(--radix-popover-content-available-height))]` + `overscroll-contain`.

**Medição** (harness Vite `.superpowers/harness-ti-1210-scroll/`, fora do Git, com `ui/sheet.tsx` e `ui/popover.tsx` reais; 30 usuários; Chrome headless 1280×768; roda real do mouse via Playwright):

| Variante | Roda na lista (`scrollTop`) | Roda no drawer com a lista aberta |
|---|---|---|
| Antes (não modal, `max-h` = altura livre) | **0** (bloqueada) | drawer 324 → 804, lista **736 → 752 px** e sai da tela (top −456) |
| Só o teto (não modal) | — | altura fica em 320, mas o drawer rola e a lista sai da tela |
| Só `modal` (sem teto) | — | drawer parado, mas a altura ainda depende do espaço livre (736 → 662 com rolagem programática) |
| **Correção (modal + teto)** | **0 → 200** | drawer parado em 324, lista fixa em 320 px; com rolagem programática do drawer, continua 320 px |

As duas partes são necessárias (sensor de discriminação acima). Gates: `tsc --noEmit` e `eslint` limpos; `npm test` 315 passaram, 3 skipped.
