CREATE TYPE "AiActivityType" AS ENUM ('ANALYZED', 'DEVELOPED', 'TESTED');

CREATE TABLE "AiActivity" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "type" "AiActivityType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "workflowId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiActivity_idempotencyKey_key" ON "AiActivity"("idempotencyKey");
CREATE INDEX "AiActivity_type_createdAt_idx" ON "AiActivity"("type", "createdAt");
CREATE INDEX "AiActivity_cardId_createdAt_idx" ON "AiActivity"("cardId", "createdAt");
ALTER TABLE "AiActivity" ADD CONSTRAINT "AiActivity_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
