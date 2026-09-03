---
sdd_version: brq-sdd@1.1.1
item: board-kanban-fusion-agents-card-trigger
itens_relacionados: [Fusion Agents workflow 84]
design: chat approval 2026-09-03
release: dev
flags: []
status: implement
gerado: 2026-09-03
atualizado: 2026-09-03
---

# Spec: identidade e triggers de cards do Fusion Agents no Board Kanban

## 1. Objetivo

Criar o usuário técnico `fusion-agents` e disparar automaticamente a Fase 0 do workflow de análise quando um card for criado ou movido entre colunas. O disparo manual por ID, código ou URL permanece disponível.

## 2. Escopo

- Usuário técnico persistido por seed/migration, resolvível pelo MCP como `fusion-agents`.
- Comentários do agente publicados com `actor: fusion-agents`.
- Eventos internos `card.created` após commit da criação e `card.moved` após commit da mudança de coluna.
- Reordenação na mesma coluna não dispara `card.moved`.
- Webhook configurável para encaminhar o evento ao trigger do Fusion Agents.
- Configuração DEV para o projeto 129 e workflow V2 84.
- Testes unitários do usuário, evento, payload, timeout e falha externa.

## 3. Fora de escopo

- Alterar ou remover workflows existentes.
- Mover cards, alterar campos ou criar branches.
- Disparar análise para cards antigos retroativamente.
- Criar autenticação nova no Board Kanban; o endpoint do Fusion usa token opaco.

## 4. Contrato

O trigger do Fusion recebe `card` com o ID do card. `card.moved` também envia `fromColumn` e `toColumn`, ambos com `id` e `name`. O envio é best-effort após o commit: erro do Fusion é registrado e não desfaz a criação ou movimentação.

## 5. Idempotência e segurança

O endpoint será configurado com o token do trigger. O payload inclui `eventId` determinístico por operação para diagnóstico. O Board não repete automaticamente nesta primeira versão; timeout e erro são logados. O workflow mantém sua própria idempotência pelo marcador da Fase 0.

## 6. Critérios de sucesso

1. `fusion-agents` aparece como autor de comentário quando o MCP recebe `actor: fusion-agents`.
2. Criar card dispara uma requisição para o endpoint configurado com `event: card.created` e `card` igual ao ID criado.
3. Mover card entre colunas dispara uma requisição com `event: card.moved`, `card` igual ao ID movido e origem/destino preenchidos.
4. Reordenar card na mesma coluna não dispara webhook.
5. Falha ou timeout do endpoint não causa rollback da criação ou movimentação.
6. O workflow manual continua aceitando `card`.
7. Testes existentes e novos passam.
