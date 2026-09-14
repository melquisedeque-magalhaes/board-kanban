ALTER TYPE "AiActivityType" ADD VALUE 'CREATED';
ALTER TYPE "AiActivityType" ADD VALUE 'REVIEWED';
CREATE TYPE "AiActivityStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "Workflow" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "externalId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Workflow_externalId_key" ON "Workflow"("externalId");

ALTER TABLE "AiActivity"
  ADD COLUMN "workflowTagId" TEXT,
  ADD COLUMN "workflowName" TEXT,
  ADD COLUMN "status" "AiActivityStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3);
UPDATE "AiActivity" SET "finishedAt" = "createdAt";
CREATE INDEX "AiActivity_workflowTagId_status_idx" ON "AiActivity"("workflowTagId", "status");
ALTER TABLE "AiActivity" ADD CONSTRAINT "AiActivity_workflowTagId_fkey"
  FOREIGN KEY ("workflowTagId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
