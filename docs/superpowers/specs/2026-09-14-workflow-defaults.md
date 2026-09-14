---
sdd_version: brq-sdd@1.7.0
item: TI-669
status: done
size: Medium
gerado: 2026-09-14
atualizado: 2026-09-14
---

# Vínculo visual e workflow padrão por atividade

Escopo aprovado por Melqui na conversa: selecionar um workflow numa atividade não identificada, aplicar ao histórico do mesmo tipo e memorizar para próximas atividades sem identificação. Fase 0 manual READY_WITH_RISKS registrada no TI-669. Base: main 84fb799 (PR #33 mergeado).

## Critérios de aceite

1. Clique em “Workflow não informado” de uma atividade abre seletor de workflows ativos. Salvar vincula aquela atividade sem alterar tipo, resultado, datas ou chave; não cria outra atividade.
2. Opção desmarcada por padrão “Aplicar a todas as atividades de [tipo] sem workflow e usar nas próximas” exige seleção explícita. Texto esclarece todos os cards, inclusive arquivados. Ao salvar, atribui workflow a todos os registros daquele tipo sem workflowTagId, workflowId externo ou nome anterior, e grava padrão persistente do tipo em transação.
3. Próxima chamada record_ai_activity sem workflowId utiliza o padrão ativo. Identidade explícita tem precedência, mesmo quando o identificador externo não está cadastrado. Outros tipos permanecem intactos.
4. Workflow inativo ou inexistente não pode ser selecionado. Desativar um padrão preserva histórico e faz novos registros sem identidade permanecerem sem workflow; não bloqueia integrações legadas.
5. Retry da chave original após vínculo manual ou automático devolve a mesma atividade. Reutilizar chave de uma criação explícita pelo contrato legado sem identificação continua retornando 409. Não inferir nova identidade a partir da tag atribuída posteriormente.
6. Totais globais de cards por atividade permanecem iguais; relatório por workflow e tags refletem os vínculos. Apenas registros sem identidade são elegíveis, sem sobrescrever atribuições anteriores, inclusive padrões anteriores.
7. Rota de vínculo exige Clerk, valida payload, card e atividade. IDs divergentes e tentativas de substituir vínculo explícito são recusados sem mudanças. Repetir a mesma escolha já aplicada é seguro.

## Plano e tasks

1. Persistência: WorkflowDefault único por AiActivityType e proveniência workflowAssigned em AiActivity para distinguir vínculo posterior/automático da identidade original. Migração aditiva com false para registros anteriores; não fazer backfill de atribuição sem ação humana.
2. Domínio/REST: transação serializável para vínculo, atualização dos cards para polling e padrão; extensão do registro legado para fallback. Testar estado resultante, preservação de explícitos, tipo, retry e padrão inativo.
3. UI: seletor por atividade, opção global explícita, erros e invalidação global de queries após aplicação ao histórico. Reusar cadastro e componentes atuais.
4. Verificação: Vitest, integração PostgreSQL isolada, typecheck, lint alterados, build e smoke no Edge; revisão independente e sensor.

## Limites

Sem deduzir workflow apenas pelo nome; sem alteração nos consumidores Fusion Agents. Padrão é global por tipo, conforme aprovado. Alterar padrão não reatribui registros já identificados; só preenche lacunas. Não criar configuração paralela na tela de cadastro: a própria ação visual define/substitui o padrão. Exclusão/limpeza de padrão e edição de vínculos já identificados ficam fora deste escopo.

Branch nasce da main. Publicação em PR separado, sem merge automático. Lint global já possui quatro erros preexistentes, documentados na entrega anterior.

## Validação

Implementação concluída. Suite com PostgreSQL 17 temporário: 40 arquivos e 290 testes aprovados; 23 migrações aplicadas. `npx tsc --noEmit`, lint dos arquivos alterados e `git diff --check` aprovados. `npx next build --webpack` aprovado, sem executar migrações de produção.

- AC1/AC2/AC6: `scripts/workflow-history.integration.test.ts`, teste “vínculo visual aplica histórico e padrão sem sobrescrever explícitos nem duplicar métricas”: dois cards (um arquivado), updatedCount 2; ID externo, nome legado e outro tipo preservados; totais globais iguais e detalhamento analyzed=2. Vínculo individual atualiza só uma atividade e não cria padrão.
- AC3/AC4: mesmo teste comprova fallback futuro, prioridade de ID explícito e ausência de fallback quando padrão desativado.
- AC5: teste “vínculo individual preserva outras atividades e identidade original nos retries” comprova retry legado com mesmo ID e 409 quando reapresentado como início explícito; esta última borda foi encontrada em revisão e passou após teste RED e correção.
- AC7: rota possui 14 testes de autenticação, validação estrita, encaminhamento de parâmetros e erros; domínio testa 404 para card/atividade divergentes, workflow inexistente, 400 para flag inválida e 409 para identificação explícita/inativo.
- UI: 5 testes de elegibilidade. Smoke no Edge 153 com componentes reais: clique por tipo, filtro de ativos, checkbox inicialmente desmarcado, vínculos individual/global, erro 409 e retry, tags/histórico atualizados; viewport 492px sem overflow.

Revisão independente de domínio/schema/migração e sensor em scratch: 2/2 mutantes detectados (retirar proteção workflowId no histórico aumenta updatedCount para 3; ignorar estado ativo do padrão atribui indevidamente novo registro). Nenhum código de produção foi mutado pelo sensor.

Limite visual: harness usou transporte HTTP em memória e fonte fallback; não comprova Clerk ponta a ponta. Integração com banco real foi verificada separadamente. Skill brq-diff-review indisponível neste host, substituída por revisão manual e revisão independente, como na entrega anterior. Evidências temporárias de UI em `/private/tmp/ti669-defaults-ui.8IJjkM/EVIDENCE.md`.
