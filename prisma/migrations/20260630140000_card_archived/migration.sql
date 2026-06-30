-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Card_archivedAt_idx" ON "Card"("archivedAt");
