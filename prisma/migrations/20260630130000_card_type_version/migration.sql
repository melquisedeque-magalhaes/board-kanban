-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('BUG', 'FEATURE', 'TAREFA');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "type" "CardType",
ADD COLUMN     "version" TEXT;
