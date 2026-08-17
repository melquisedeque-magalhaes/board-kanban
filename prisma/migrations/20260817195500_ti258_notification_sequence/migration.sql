-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "sequence" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "Notification_recipientId_sequence_idx" ON "Notification"("recipientId", "sequence");
