import { TaskAnalysisSchema } from "@ubuliera/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUs2Harness, type Us2Harness } from "../../helpers/us2";

let h: Us2Harness;
let projectId: string;

const VALID_PLAN = JSON.stringify({
  tasks: [
    {
      title: "Add endpoint",
      description: "Add GET /users",
      assignedAgentRole: "backend-developer",
      dependsOn: [],
      priority: "p1",
      ownedPaths: ["src/api/**"],
      riskClass: "normal",
      mechanismReason: null,
    },
  ],
});

beforeEach(async () => {
  h = await createUs2Harness();
  projectId = (await h.services.projects.register({ rootPath: h.root }, "user")).id;
});
afterEach(() => h.close());

const o = () => h.orchestration.orchestrator;

async function configured() {
  const e = await o().create({ projectId, prompt: "Add a users endpoint" }, "user");
  await o().setMode(e.id, { mode: "subagents", strategy: "direct" }, "user");
  return e;
}

describe("analysis consent (FR-008)", () => {
  it("default analysis is local only: no model query, no session", async () => {
    const e = await o().create({ projectId, prompt: "Add a users endpoint" }, "user");
    expect(e.status).toBe("awaiting_mode");
    const analysis = TaskAnalysisSchema.parse(e.analysis);
    expect(analysis.modelAssisted).toBe(false);
    expect(analysis.stack.languages).toContain("TypeScript");
    expect(analysis.instructionFiles).toContain("CLAUDE.md");
    expect(analysis.skills).toContain("release-notes");
    expect(analysis.agents).toContain("api-guardian");
    expect(analysis.mcpServers).toContain("postgres");
    expect(analysis.summary).toMatch(/no model/i);
    expect(h.runtime.queries).toHaveLength(0);
    expect(h.runtime.sessions).toHaveLength(0);
  });

  it("model-backed analysis is refused with APPROVAL_REQUIRED without consent", async () => {
    const e = await o().create({ projectId, prompt: "Add a users endpoint" }, "user");
    await expect(
      o().refineAnalysis(e.id, { consent: false, rememberConsentForProject: false }, "user"),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED", status: 428 });
    expect(h.runtime.queries).toHaveLength(0);
  });

  it("model-backed analysis runs with per-execution consent and validates the output", async () => {
    const e = await o().create({ projectId, prompt: "Add a users endpoint" }, "user");
    h.runtime.replies.push('```json\n{"complexity":"high","summary":"Touches API and DB."}\n```');
    const refined = await o().refineAnalysis(
      e.id,
      { consent: true, rememberConsentForProject: false },
      "user",
    );
    expect(h.runtime.queries).toHaveLength(1);
    expect(refined.config.modelAnalysisConsent).toBe(true);
    expect(refined.analysis?.modelAssisted).toBe(true);
    expect(refined.analysis?.complexity).toBe("high");
    expect(refined.analysis?.skills).toContain("release-notes");
  });

  it("invalid model analysis output is ignored, never trusted", async () => {
    const e = await o().create({ projectId, prompt: "Add a users endpoint" }, "user");
    h.runtime.replies.push('{"complexity":"apocalyptic","summary":42}');
    const refined = await o().refineAnalysis(
      e.id,
      { consent: true, rememberConsentForProject: false },
      "user",
    );
    expect(refined.analysis?.modelAssisted).toBe(false);
    expect(refined.analysis?.complexity).toBe(e.analysis?.complexity);
  });

  it("model-backed planning needs consent; local planning never queries the model", async () => {
    const e = await configured();
    await expect(
      o().generatePlan(
        e.id,
        { modelAssisted: true, consent: false, rememberConsentForProject: false },
        "user",
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const local = await o().generatePlan(
      e.id,
      { modelAssisted: false, consent: false, rememberConsentForProject: false },
      "user",
    );
    expect(local.items.length).toBeGreaterThan(0);
    expect(h.runtime.queries).toHaveLength(0);
  });

  it("a per-project always-allow preference counts as consent and can be revoked", async () => {
    const e = await configured();
    h.orchestration.consent.setAlwaysAllow(projectId, true, "user");
    h.runtime.replies.push(VALID_PLAN);
    const plan = await o().generatePlan(
      e.id,
      { modelAssisted: true, consent: false, rememberConsentForProject: false },
      "user",
    );
    expect(plan.items.map((t) => t.id)).toEqual(["T-1"]);
    expect(h.runtime.queries).toHaveLength(1);

    h.orchestration.consent.setAlwaysAllow(projectId, false, "user");
    const e2 = await configured();
    await expect(
      o().generatePlan(
        e2.id,
        { modelAssisted: true, consent: false, rememberConsentForProject: false },
        "user",
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("rememberConsentForProject stores the always-allow preference", async () => {
    const e = await configured();
    h.runtime.replies.push(VALID_PLAN);
    await o().generatePlan(
      e.id,
      { modelAssisted: true, consent: true, rememberConsentForProject: true },
      "user",
    );
    expect(h.orchestration.consent.isAlwaysAllowed(projectId)).toBe(true);
    expect(h.audit.list({ limit: 50 }).items.map((a) => a.action)).toContain(
      "consent.model_usage.set",
    );
  });
});
