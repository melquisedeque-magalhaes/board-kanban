---
sdd_version: brq-sdd@2.4.1
item: TI-1210
status: implement
size: Small
gerado: 2026-11-26
atualizado: 2026-11-26
---

# Lista de usuários: vincular responsável e filtro do kanban

**Card:** TI-1210 — Melhorar a usabilidade da lista de usuários (vincular responsável e filtro do kanban)
**Branch:** TI-1210 (worktree `board-kanban/TI-1210`), base `main` 8445972
**Superfície:** board-kanban web (Next.js). Não há desktop nem worker neste produto.
**Fase 0:** READY_WITH_RISKS, registrada no card. Ver `2026-11-26-ti-1210-lista-usuarios-requirement-analysis.md`.
**DoR:** avaliação manual, PRONTO COM RESSALVA: os critérios estão escritos e são testáveis, mas a causa do problema 2 ainda está a confirmar. O repo não tem delta de critérios `brq-dor`.

## 1. Objetivo

As listas de usuários do board devem caber na tela e manter a posição de rolagem, para que seja possível vincular pessoas a um card e filtrar o kanban por responsável sem rolar a página nem perder o lugar na lista.

### 1.2 Fora de escopo

| Fica fora | Por quê |
|---|---|
| Busca/typeahead nas listas de usuário | melhoria funcional nova, que não está no card |
| Lista de membros do botão Share | já tem `max-h-64 overflow-y-auto` (`Chrome.tsx`) |
| Filtros de Prioridade e Tipo | têm poucos itens e não apresentam o defeito |
| Ordem e conteúdo da lista de usuários | o card não pede mudança |

## Suposições

1. A superfície é só a web, em desktop e mobile. O produto não tem app Electron.
2. Para "abre inteira na área visível", basta o popover caber na viewport e rolar por dentro quando houver mais usuários que altura disponível. Exibir todos os itens sem rolagem interna é impossível com N grande.
3. Nenhuma mudança de backend, contrato, dado ou flag.
4. Não existe design visual: o card não tem link de Figma nem anexo. A referência é a tela atual.

## 15. Critérios de sucesso

| AC | Critério testável |
|---|---|
| AC1 | Com 14 ou mais usuários e viewport de 768 px de altura, o popover de Responsável abre com a borda inferior dentro da viewport (`getBoundingClientRect().bottom <= innerHeight`), e a página/drawer não rola. Itens além da altura disponível são alcançados pela rolagem interna do popover. |
| AC1b | O mesmo vale para "Solicitado por" e "Tester / QA" (extensão aprovada na triagem). |
| AC2 | No filtro → Responsável, rolar a lista até um item do meio e esperar mais de 25 s (cobre um ciclo de presença de 20 s): o `scrollTop` do viewport não volta a 0. |
| AC3 | No filtro → Responsável, usar a seta inferior até o último usuário: a lista desce até o fim sem voltar ao topo. |
| AC4 | Selecionar um usuário em Responsável continua adicionando e removendo o responsável no card. Selecionar no filtro continua filtrando o kanban, e "Todos" e "Limpar filtros" continuam funcionando. |

## 16. Premissas e questões em aberto

| Item | Dono | Confirmado? |
|---|---|---|
| A causa do problema 2 precisa ser reproduzida antes da edição (H1: modo `item-aligned`; H2: re-render da presença). | Pedro | Não. Primeiro passo do IMPLEMENT |
| `não-validado-contra-design-visual`: o card não tem link de design. | Pedro (solicitante) | Sim. A referência é a tela atual |

## 11. Boundaries

- **Sempre:** mudar só classes e props de posicionamento dos componentes de UI envolvidos; manter o comportamento de seleção.
- **Pergunte primeiro:** trocar os componentes (por exemplo, Popover por Command/Combobox) ou adicionar dependência.
- **Nunca:** alterar o wrapper `ui/select.tsx` ou `ui/popover.tsx` de forma global sem medir os outros consumidores; commitar ou fazer push sem OK.

## 10. Testes

O repo não tem teste de componente (Vitest `environment: node`). A prova de AC1–AC3 é **visual**: medição de `getBoundingClientRect`/`scrollTop` no navegador, com screenshot no `-validation.md`. AC4 é smoke manual. Gates automáticos: `npm run lint`, `npx tsc --noEmit`, `npm test`.

## Plano e tasks (inline, Small)

1. **Diagnóstico do problema 2** (sem editar): subir o app, reproduzir o reset ao rolar e com a seta, e isolar a causa (H1 ou H2) com evidência. Se a causa exigir mais que ajuste de posicionamento, reclassificar o porte.
2. **Problema 1:** em `CardDrawer.tsx`, os dois `PopoverContent` de usuário ganham `max-h-(--radix-popover-content-available-height) overflow-y-auto`, com um teto fixo (ex.: `max-h-80`) se a medição pedir.
3. **Problema 2:** aplicar a correção que o diagnóstico indicar no `SelectContent` do filtro de Responsável em `Chrome.tsx` (provável `position="popper"` com altura limitada), sem mexer no wrapper global.
4. **Verificação:** lint, typecheck, testes, medição visual de AC1–AC4 e registro no `-validation.md`.
