import reviewAndMerge from "./templates/review-and-merge.json";
import specDriven from "./templates/spec-driven.json";
import tddFeature from "./templates/tdd-feature.json";

/** Built-in workflow templates (T130), seeded once as `builtIn` definitions with version 1. */
export interface WorkflowTemplate {
  name: string;
  description: string;
  /** validated (and defaults applied) when seeded */
  graph: unknown;
}

export const BUILT_IN_TEMPLATES: readonly WorkflowTemplate[] = [
  specDriven,
  tddFeature,
  reviewAndMerge,
];
