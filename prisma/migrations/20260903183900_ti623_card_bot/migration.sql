-- Marca de "card em operação por robô" (TI-623). Ligada/desligada
-- explicitamente pelo MCP; nenhuma escrita a liga por inferência.
ALTER TABLE "Card" ADD COLUMN "bot" BOOLEAN NOT NULL DEFAULT false;
