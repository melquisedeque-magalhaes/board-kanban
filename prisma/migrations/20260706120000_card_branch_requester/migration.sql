-- AlterTable
ALTER TABLE "Card" ADD COLUMN "branchUrl" TEXT,
ADD COLUMN "requestedById" TEXT;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
