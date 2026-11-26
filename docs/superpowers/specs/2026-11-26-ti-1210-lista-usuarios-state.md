# STATE — TI-1210 Lista de usuários (vincular responsável e filtro do kanban)

## Decisões

### AD-001
- **Decisão**: Select dentro de popover, com lista longa, usa `position="popper"`.
- **Razão**: no `item-aligned` do Radix Select 2.3.1, todo re-render reposiciona a lista e zera a rolagem. O board re-renderiza por presença e por polling.
- **Trade-off**: a lista abre abaixo do gatilho em vez de alinhada ao item selecionado.
- **Escopo**: selects do board com muitos itens em telas com polling (hoje, o filtro de Responsável). O wrapper `ui/select.tsx` não mudou.
- **Data**: 2026-11-26
- **Status**: ativa

## Handoff

- **Feature**: docs/superpowers/specs/2026-11-26-ti-1210-lista-usuarios.md
- **Fase / Task**: Fase 4 concluída, branch publicada.
- **Concluído**: diagnóstico, problema 1 (+ campos irmãos), problema 2, gates, validação em harness e no app real (local, mockado)
- **Em andamento (arquivo:linha)**: nenhum
- **Próximo passo**: abrir PR para `main` (o repo usa PR direto para `main`) e mover o card
- **Bloqueios**: nenhum
- **Arquivos por task (não commitados)**: src/components/board/CardDrawer.tsx, src/components/board/Chrome.tsx, docs/superpowers/specs/2026-11-26-ti-1210-*
- **Branch**: TI-1210
- **Worktree / SHA de origem**: C:/Users/pedro/orca/workspaces/board-kanban/TI-1210 · 8445972
