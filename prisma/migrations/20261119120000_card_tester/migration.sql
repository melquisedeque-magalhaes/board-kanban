-- AlterTable
ALTER TABLE "Card" ADD COLUMN "testedById" TEXT;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_testedById_fkey" FOREIGN KEY ("testedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
