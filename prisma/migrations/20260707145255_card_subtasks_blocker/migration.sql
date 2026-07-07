-- CreateEnum
CREATE TYPE "Blocker" AS ENUM ('IMPEDIMENTO', 'AVISO');

-- AlterEnum
ALTER TYPE "CardType" ADD VALUE 'SUBTASK';

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "blocker" "Blocker",
ADD COLUMN     "blockerReason" TEXT,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Card_parentId_idx" ON "Card"("parentId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
