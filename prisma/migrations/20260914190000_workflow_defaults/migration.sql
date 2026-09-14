ALTER TABLE "AiActivity" ADD COLUMN "workflowAssigned" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "WorkflowDefault" (
  "type" "AiActivityType" NOT NULL,
  "workflowTagId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowDefault_pkey" PRIMARY KEY ("type"),
  CONSTRAINT "WorkflowDefault_workflowTagId_fkey" FOREIGN KEY ("workflowTagId")
    REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
