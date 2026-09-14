# TI-669 — Evidências de validação

## Gate técnico

- Suite completa com banco temporário: 38 arquivos, 269 testes aprovados. Comando: `DATABASE_URL=postgresql://kanban:kanban@127.0.0.1:55469/kanban WORKFLOW_DB_TEST=1 npm test`.
- PostgreSQL 17 dedicado na porta 55469: 22 migrações aplicadas, incluindo a migração aditiva de histórico.
- `npx next build --webpack`: aprovado, incluindo compilação TypeScript e geração de rotas. Sem executar o wrapper que aplica migrações no build.
- `npx tsc --noEmit`, lint dos arquivos alterados e `git diff --check`: aprovados.
- Lint global: quatro erros preexistentes de `react-hooks/set-state-in-effect` em `src/app/docs/page.tsx`, `src/components/board/BoardApp.tsx`, `src/components/board/ProfileDialog.tsx` e `src/components/triggers/TriggersApp.tsx`. Reproduzidos também na main original; nenhum desses arquivos foi alterado.

## Cobertura dos critérios

- AC1/AC4: `src/server/workflow-history.test.ts:51` e `:79`: cadastro valida nome/cor/externalId; desativação impede início e permite encerrar mantendo snapshot.
- AC2/AC10: persistência em `src/server/workflow-history.test.ts`, apresentação em `src/components/workflows/workflow-ui.test.ts` e consulta REST autenticada nos testes de rotas.
- AC3: duas participações independentes no teste de domínio; teste PostgreSQL comprova que encerrar uma não encerra outra. UI deriva operação do marcador manual ou de alguma participação RUNNING.
- AC5: `src/server/workflow-history.test.ts:71` e `:107`: testes de identidade exigem status 409 para card, atividade, runId e workflowTagId diferentes; reprodução extra cobre colisão legado/cadastro sem externalId.
- AC6/AC7: `src/server/reports.test.ts:28` verifica cards únicos globalmente e por workflow; `scripts/workflow-history.integration.test.ts:28` comprova que concluir outra execução no mesmo card não aumenta métricas e que criação aumenta só a atividade pertinente.
- AC8: `src/server/ai-activities.test.ts`, teste de domínio legado e testes MCP preservam a chamada anterior e aceitam novos tipos.
- AC9: `src/app/api/workflows/route.test.ts:25` exige 401 sem sessão nas seis operações REST; `src/app/api/mcp/route.test.ts` cobre Bearer.
- AC10: teste PostgreSQL mantém contagens após arquivar card/desligar bot; snapshot do nome resiste à renomeação/desativação.

## Revisão independente e sensor

Revisor independente inspecionou domínio, schema e migração. Encontrou colisão entre chamada legada sem workflow e participação cadastrada sem externalId; corrigida com teste que falhou antes e passou após o ajuste.

Sensor executado em cópia temporária, sem mutar o código entregue:

- Remover bloqueio de workflow inativo: detectado pelo teste de desativação.
- Remover comparação de runId: inicialmente sobreviveu. Após acrescentar asserção específica, detectado pelo teste de conflito (baseline 8/8; mutação 1 falha).

Concorrência real validada em `scripts/workflow-history.integration.test.ts`: dois inícios simultâneos retornam o mesmo id, dois encerramentos simultâneos preservam resultado e nova conclusão não duplica total do card.

A skill `brq-diff-review` referenciada pelo SDD não está instalada nos caminhos locais consultados. Substituída por revisão manual do diff e revisão independente do domínio; esta limitação não foi ocultada como execução da skill.

## Validação visual concluída

Microsoft Edge 153: criar, renomear e desativar workflow; registrar duas participações RUNNING simultâneas; concluir uma preservando a outra ativa; concluir ambas removendo o destaque de execução; workflow inativo ausente do seletor e histórico preservado. Desktop e viewport reduzido de 492px sem overflow horizontal. Sem erro de aplicação; único console error foi favicon 404 do harness.

Evidências temporárias: `/private/tmp/ti669-ui.dMXCm5/EVIDENCE.md`; screenshots `ti669-workflows-completed.png` e `ti669-workflows-mobile.png` no diretório temporário da sessão. Harness e aba de teste encerrados após o smoke. PostgreSQL temporário e seu volume de fixtures removidos após a integração.

## Limites da entrega

Sem deploy nem alterações nos workflows consumidores do Fusion Agents. A integração automática depende de cada workflow chamar as tools de início e término. Banco de testes isolado, sem acesso ao banco de produção. Validação visual usa componentes reais em harness temporário com respostas HTTP em memória; não comprova autenticação Clerk ponta a ponta.
