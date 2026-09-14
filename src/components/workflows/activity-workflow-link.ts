type WorkflowIdentity = {
  workflowTagId?: string | null;
  workflowId?: string | null;
  workflowName?: string | null;
  workflow?: { id: string } | null;
};

export function canLinkWorkflow(activity: WorkflowIdentity) {
  return !activity.workflowTagId && !activity.workflowId && !activity.workflowName && !activity.workflow?.id;
}
