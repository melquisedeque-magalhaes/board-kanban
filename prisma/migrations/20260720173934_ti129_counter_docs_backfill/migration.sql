-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "documentation" TEXT;

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Counter_name_key" ON "Counter"("name");

-- Backfill: cards sem chave recebem TI-N sequencial, continuando do maior número atual.
WITH mx AS (
  SELECT COALESCE(MAX(CAST(SUBSTRING("code" FROM 4) AS INTEGER)), 0) AS m
  FROM "Card"
  WHERE "code" ~ '^TI-[0-9]+$'
),
numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Card"
  WHERE "code" IS NULL
)
UPDATE "Card" c
SET "code" = 'TI-' || (mx.m + n.rn)
FROM numbered n, mx
WHERE c."id" = n."id";

-- Seed do contador no maior número já existente (inclui os recém-preenchidos).
INSERT INTO "Counter" ("id", "name", "value")
SELECT 'counter_card', 'card',
       COALESCE(MAX(CAST(SUBSTRING("code" FROM 4) AS INTEGER)), 0)
FROM "Card"
WHERE "code" ~ '^TI-[0-9]+$';
