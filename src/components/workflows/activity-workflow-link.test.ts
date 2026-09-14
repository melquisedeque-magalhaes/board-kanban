import { describe, expect, it } from "vitest";
import { canLinkWorkflow } from "./activity-workflow-link";

describe("vínculo visual de atividade sem workflow", () => {
  it("permite atividade sem identidade anterior", () => {
    expect(canLinkWorkflow({})).toBe(true);
    expect(canLinkWorkflow({ workflowTagId: null, workflowId: null, workflowName: null, workflow: null })).toBe(true);
  });
  it.each([
    { workflowTagId: "workflow-1" },
    { workflowId: "external-1" },
    { workflowName: "Workflow legado" },
    { workflow: { id: "workflow-1" } },
  ])("preserva identidade existente %j", (identity) => {
    expect(canLinkWorkflow(identity)).toBe(false);
  });
});
