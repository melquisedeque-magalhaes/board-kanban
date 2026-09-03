CREATE TABLE "WorkflowTrigger" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkflowTrigger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowTrigger_event_enabled_idx" ON "WorkflowTrigger"("event", "enabled");
