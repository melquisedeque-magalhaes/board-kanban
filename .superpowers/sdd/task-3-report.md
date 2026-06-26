# Task 3 Report — Camada de domínio (server/cards.ts)

## Files criados

- `src/server/types.ts` — tipos exportados: `Priority` (re-export), `CardFilter`, `CreateCardInput`, `UpdateCardInput`
- `src/server/cards.ts` — implementação completa da camada de domínio
- `src/server/cards.test.ts` — testes TDD (4 casos)

## Comandos executados

```bash
# Falha esperada (módulo não existia):
node_modules/.bin/vitest run src/server/cards.test.ts
# Error: Cannot find module '/src/server/cards'

# Após criação de cards.ts, falha de hoisting:
# Error: Cannot access 'dbMock' before initialization
# (vi.mock é hoisted, dbMock const não estava disponível)

# Fix: trocar const dbMock = { ... } por vi.hoisted(() => ({ ... }))
# Resultado após fix:
node_modules/.bin/vitest run src/server/cards.test.ts --reporter=verbose
```

## Saída fail → pass

### Fase FAIL (antes de cards.ts existir)
```
FAIL  src/server/cards.test.ts
Error: Cannot find module '/src/server/cards'
```

### Fase FAIL (hoisting issue — antes do fix no teste)
```
FAIL  src/server/cards.test.ts
ReferenceError: Cannot access 'dbMock' before initialization
```

### Fase PASS (após fix + implementação)
```
 RUN  v4.1.9 /Users/user/melqui/brq/board-kanban

 ✓ src/server/cards.test.ts > resolveColumnId > usa columnId direto se válido 1ms
 ✓ src/server/cards.test.ts > resolveColumnId > resolve por nome 0ms
 ✓ src/server/cards.test.ts > resolveColumnId > throw se não achar 1ms
 ✓ src/server/cards.test.ts > moveCard > calcula position no fim quando omitida 0ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  197ms
```

## Desvios do brief

**Test file — vi.hoisted:** O brief mostra `const dbMock = { ... }` simples antes de `vi.mock`. Em vitest, `vi.mock` é hoisted antes de qualquer import/const, então `dbMock` não estaria inicializado quando o factory é chamado. A solução foi envolver o objeto com `vi.hoisted(() => ({ ... }))` — comportamento idêntico, apenas sintaxe correta para hoisting do vitest. Os nomes e estrutura dos mocks são exatamente iguais ao brief.

**Implementação (cards.ts):** idêntica ao brief, sem desvios.

## Nota sobre resolveColumnId e moveCard

`moveCard` chama `resolveColumnId({ columnId: columnIdRef, columnName: columnIdRef })` passando o mesmo valor nos dois campos. O fluxo:

1. `findUnique({ where: { id: columnIdRef } })` — se `columnIdRef` for um UUID válido, retorna a coluna diretamente.
2. Se `findUnique` retornar `null` (ex.: string passou como nome, não como UUID), cai no `findFirst({ where: { name: columnIdRef } })`.
3. Se ambos falharem, lança erro.

**Concern:** essa estratégia de "passa tudo como id e também como name" funciona bem para casos onde o chamador tem certeza do tipo (UUID vs nome legível), mas pode ser ambígua se um nome de coluna for um UUID válido no banco. Para o caso de uso do board (nomes de coluna são textos como "Em Andamento", "Done"), não há risco prático. Tasks 5/6 (REST + MCP) devem garantir que passam o tipo correto ao chamar `moveCard` para evitar dupla lookup desnecessária.

## Exports disponíveis para Tasks 5 e 6

```ts
// src/server/cards.ts
export { resolveColumnId, resolveUserIds, listColumns, listCards, getCard,
         createCard, updateCard, moveCard, addComment, listUsers, listLabels }

// src/server/types.ts
export type { Priority, CardFilter, CreateCardInput, UpdateCardInput }
// CardDTO, ColumnWithCards, CardDetail são inferidos do retorno das funções Prisma
```

> Nota: `CardDTO`, `ColumnWithCards`, `CardDetail` não são interfaces explícitas em `types.ts` — são o tipo inferido do retorno das queries Prisma (com `include: cardInclude`). Tasks 5/6 devem usar `Awaited<ReturnType<typeof listCards>>[number]` etc., ou o brief das tasks seguintes os nomeia explicitamente via `typeof`.
