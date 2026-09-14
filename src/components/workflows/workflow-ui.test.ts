import { describe, expect, it } from "vitest";
import { workflowTags, type WorkflowActivity } from "./workflow-ui";

function activity(overrides: Partial<WorkflowActivity>): WorkflowActivity {
  return { id: "activity", type: "DEVELOPED", status: "COMPLETED", createdAt: "2026-09-14T12:00:00Z", ...overrides };
}

describe("workflow participation tags", () => {
  it("deduplicates attempts but preserves operation while any attempt is running", () => {
    const workflow = { id: "impl", name: "Implementação atual", color: "#123456", active: false };
    const tags = workflowTags([
      activity({ workflow, workflowName: "Nome antigo", status: "RUNNING" }),
      activity({ workflow, status: "FAILED" }),
      activity({ workflow, status: "COMPLETED" }),
    ]);
    expect(tags).toEqual([{ id: "registered:impl", name: "Implementação atual", color: "#123456", running: true }]);
  });

  it("keeps different workflows and legacy identities separate", () => {
    expect(workflowTags([
      activity({ workflow: { id: "impl", name: "Implementação", color: "#123456", active: true } }),
      activity({ workflowId: "impl" }), activity({ workflowId: "impl" }),
      activity({}), activity({}),
    ]).map((tag) => tag.id)).toEqual(["registered:impl", "external:impl", "legacy"]);
  });

  it("does not infer operation from completed or failed participation", () => {
    expect(workflowTags([activity({ status: "FAILED" }), activity({ status: "COMPLETED" })])[0].running).toBe(false);
  });
});
