import { createUs2Harness, type Us2Harness, type Us2HarnessOptions } from "./us2";
import { registerWorkflowRoutes } from "../../src/http/routes/workflows";
import { createWorkflowEngine, type WorkflowEngine } from "../../src/modules/workflow-engine";

export interface Us5Harness extends Us2Harness {
  workflows: WorkflowEngine;
}

export interface Us5HarnessOptions extends Omit<Us2HarnessOptions, "extend"> {
  /** backoff waits (default: none, so retries run at once) */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** seed the built-in templates (default true, like server startup) */
  seed?: boolean;
}

/**
 * US2 harness + the US5 workflow engine and routes, wired the way the lead wires them in
 * orchestration.ts (createWorkflowEngine + registerWorkflowRoutes + seed at startup).
 */
export async function createUs5Harness(opts: Us5HarnessOptions = {}): Promise<Us5Harness> {
  let engine: WorkflowEngine | undefined;
  const h = await createUs2Harness({
    ...opts,
    extend: (p) => {
      engine = createWorkflowEngine({
        db: p.db,
        bus: p.bus,
        store: p.store,
        audit: p.audit,
        logger: p.logger,
        orchestration: p.orchestration,
        runtime: p.runtime,
        projects: p.services.projects,
        homeDir: p.home,
        mode: { sleep: opts.sleep ?? (() => Promise.resolve()) },
      });
      const service = engine.service;
      return (api) => registerWorkflowRoutes(api, { workflows: service });
    },
  });
  if (!engine) throw new Error("workflow engine was not created");
  if (opts.seed !== false) engine.seed();
  return { ...h, workflows: engine };
}
