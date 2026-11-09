import { type ExecutionTasks } from "@nexora/contracts";

import { http } from "@/shared/api";

import {
  type ApproveExecutionInput,
  type CreateExecutionInput,
  type Execution,
  type ExecutionConfig,
  type ExecutionList,
  type GeneratePlanInput,
  type ModeOption,
  type Question,
  type RuntimeEnvironment,
  type SetModeInput,
  type Verification,
} from "../model/types";

type Opts = { signal?: AbortSignal };
type Items<T> = { items: T[] };

const path = (id: string, sub = "") => `/executions/${encodeURIComponent(id)}${sub}`;

export const executionApi = {
  /** the local heuristic analysis (no model usage) runs synchronously → `awaiting_mode` */
  create: (input: CreateExecutionInput) =>
    http.post<Execution>("/executions", input).then((r) => r.data),

  list: (opts: Opts = {}) => http.get<ExecutionList>("/executions", opts).then((r) => r.data),

  byId: (id: string, opts: Opts = {}) => http.get<Execution>(path(id), opts).then((r) => r.data),

  modes: (id: string, opts: Opts = {}) =>
    http.get<Items<ModeOption>>(path(id, "/modes"), opts).then((r) => r.data.items),

  setMode: (id: string, input: SetModeInput) =>
    http.put<Execution>(path(id, "/mode"), input).then((r) => r.data),

  questions: (id: string, opts: Opts = {}) =>
    http.get<Items<Question>>(path(id, "/questions"), opts).then((r) => r.data.items),

  updateConfig: (id: string, config: ExecutionConfig) =>
    http.put<Execution>(path(id, "/config"), { config }).then((r) => r.data),

  /** 428 APPROVAL_REQUIRED when `modelAssisted` is requested without consent (FR-008) */
  generatePlan: (id: string, input: GeneratePlanInput) =>
    http.post<ExecutionTasks>(path(id, "/plan"), input).then((r) => r.data),

  approve: (id: string, input: ApproveExecutionInput) =>
    http.post<Execution>(path(id, "/approve"), input).then((r) => r.data),

  stop: (id: string) => http.post<Execution>(path(id, "/stop")).then((r) => r.data),

  /** "Interrupt & hold" (FR-031) — 422 if any runtime cannot interrupt + resume */
  pause: (id: string) => http.post<Execution>(path(id, "/pause")).then((r) => r.data),

  resume: (id: string) => http.post<Execution>(path(id, "/resume")).then((r) => r.data),

  /** 404 until the execution reached `verifying` */
  verification: (id: string, opts: Opts = {}) =>
    http.get<Verification>(path(id, "/verification"), opts).then((r) => r.data),

  runtimeEnvironment: (opts: Opts = {}) =>
    http.get<RuntimeEnvironment>("/runtime/environment", opts).then((r) => r.data),
};
