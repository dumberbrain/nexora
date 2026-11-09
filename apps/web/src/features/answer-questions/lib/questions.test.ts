import { describe, expect, it } from "vitest";

import { answersSchema, defaultValues, fieldName, toConfig } from "./questions";
import { defaultConfig, questionFixtures } from "../../../../tests/msw/handlers";

describe("answer-questions lib", () => {
  it("pre-fills every question with its recommended default", () => {
    expect(defaultValues(questionFixtures)).toEqual({
      q0: "parallel",
      q1: 3,
      q2: true,
      q3: ["team-frontend"],
      q4: "",
    });
  });

  it("validates number bounds from the question", () => {
    const schema = answersSchema(questionFixtures);
    const values = { ...defaultValues(questionFixtures), [fieldName(1)]: 9 };
    expect(schema.safeParse(values).success).toBe(false);
  });

  it("maps config keys onto the config and answers.* into config.answers", () => {
    const config = toConfig(defaultConfig, questionFixtures, {
      q0: "sequential",
      q1: 2,
      q2: false,
      q3: ["speckit-plan"],
      q4: "keep it small",
    });
    expect(config).toMatchObject({
      parallelism: "sequential",
      maxParallelSessions: 2,
      approvalCheckpoints: false,
      answers: { skills: ["speckit-plan"], notes: "keep it small" },
    });
  });
});
