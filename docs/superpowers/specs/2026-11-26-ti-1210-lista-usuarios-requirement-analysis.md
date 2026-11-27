---
item: TI-1210
fase: 0
veredicto: READY_WITH_RISKS
gerado: 2026-11-26
---

# Fase 0 — TI-1210 Lista de usuários (vincular responsável e filtro do kanban)

**Card:** TI-1210 — Melhorar a usabilidade da lista de usuários (vincular responsável e filtro do kanban) · BUG · MEDIA
**Repositório:** board-kanban (Next.js 16, React, Radix UI via `radix-ui`, Vitest em ambiente node) · base `main` 8445972
**Análise:** manual, método `brq-sdd` genérico. A skill `brq-fusionagents-analyze-requirement` é específica do code-agents-platform e não se aplica a este repo.

## Veredicto

`READY_WITH_RISKS`. Os dois problemas e os 4 critérios estão escritos e são testáveis. O problema 1 tem causa confirmada no código. O problema 2 ainda não tem causa reproduzida, e esse é o risco residual.

## Critérios de aceite (do card, numerados)

1. Ao vincular um responsável, a lista de usuários abre inteira na área visível, sem rolar a página.
2. No filtro de usuário do kanban, rolar a lista não a faz voltar ao topo.
3. No filtro de usuário do kanban, a seta do fim da lista desce os itens sem voltar ao topo.
4. A seleção de usuário continua funcionando nos dois pontos.

Extensão aprovada pelo responsável na triagem (2026-11-26): o critério 1 vale também para "Solicitado por" e "Tester / QA", que têm a mesma causa.

## Achados no repositório

| Achado | Evidência | Confiança |
|---|---|---|
| O popover de Responsável não limita a altura nem tem rolagem própria. Com N usuários, ele cresce além da viewport. | `src/components/board/CardDrawer.tsx#Responsável` (PopoverContent `w-60 p-1`, sem `max-h`/`overflow`) | HIGH |
| `UserPickField` (Solicitado por, Tester / QA) tem o mesmo padrão. | `src/components/board/CardDrawer.tsx#UserPickField` | HIGH |
| O `PopoverContent` do Radix expõe `--radix-popover-content-available-height`, que ainda não é usado. | `src/components/ui/popover.tsx#PopoverContent` | HIGH |
| O filtro de Responsável é um `Select` com `position="item-aligned"` (default do wrapper) aninhado num `Popover`. | `src/components/board/Chrome.tsx#Filtro`, `src/components/ui/select.tsx#SelectContent` | HIGH |
| Re-render periódico de `Chrome`: a presença (`online`) é refetchada a cada 20 s. | `src/components/board/BoardApp.tsx#presence` | MEDIUM (como causa) |
| O repo não tem teste de componente (Vitest `environment: node`, sem testing-library). | `vitest.config.ts` | HIGH |

## Hipóteses para o problema 2 (a confirmar no IMPLEMENT, antes de editar)

- H1: o modo `item-aligned` do Radix Select recalcula a posição e reposiciona a rolagem no item selecionado ("Todos", no topo) quando o conteúdo expande ao rolar ou quando o pai re-renderiza.
- H2: o re-render causado pela presença dispara o reposicionamento.

## Riscos residuais

| Risco | Dono | Quando se resolve |
|---|---|---|
| A causa do problema 2 não está reproduzida. A correção pode exigir mais que trocar o modo de posicionamento. | quem implementa (Pedro) | início do IMPLEMENT, antes da primeira edição |
| Layout não tem prova automatizada. A validação é visual (medição/screenshot). | quem implementa | gate visual, no `-validation.md` |

## Cenários de teste

- Board com 14 ou mais usuários, viewport de 768 px de altura e card perto do fim do drawer. Abrir Responsável: a lista cabe na tela e rola por dentro.
- Mesma situação para Solicitado por e Tester / QA.
- Filtro → Responsável: rolar até o meio, aguardar mais de 20 s (ciclo de presença) e confirmar que a posição se mantém.
- Filtro → Responsável: usar a seta de rolagem inferior até o fim, sem voltar ao topo.
- Selecionar um usuário nos dois pontos: o card recebe o responsável e o kanban filtra.
