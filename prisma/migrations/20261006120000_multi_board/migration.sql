-- AlterTable
ALTER TABLE "Board" ADD COLUMN "description" TEXT;

-- CreateIndex
CREATE INDEX "Column_boardId_position_idx" ON "Column"("boardId", "position");

-- O subtítulo do board era fixo na UI; vira dado do board existente.
UPDATE "Board" SET "description" = 'Kanban de tarefas do time de IA' WHERE "description" IS NULL;
