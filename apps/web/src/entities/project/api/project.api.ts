import { type InstallHooksInput } from "@ubuliera/contracts";

import { http } from "@/shared/api";

import {
  type HookPreview,
  type ModelConsent,
  type ModelConsentInput,
  type Project,
  type ProjectList,
  type RegisterProjectInput,
} from "../model/types";

type Opts = { signal?: AbortSignal };

export const projectApi = {
  list: (opts: Opts = {}) => http.get<ProjectList>("/projects", opts).then((r) => r.data),

  register: (input: RegisterProjectInput) =>
    http.post<Project>("/projects", input).then((r) => r.data),

  hookPreview: (id: string, opts: Opts = {}) =>
    http
      .get<HookPreview>(`/projects/${encodeURIComponent(id)}/hooks/preview`, {
        ...opts,
      })
      .then((r) => r.data),

  /** FR-041: the server rejects anything without `confirm: true`. Returns the updated project. */
  installHooks: (id: string) =>
    http
      .post<Project>(`/projects/${encodeURIComponent(id)}/hooks/install`, {
        confirm: true,
      } satisfies InstallHooksInput)
      .then((r) => r.data),

  /** Removes only Ubuliera's hook entries. Returns the updated project. */
  uninstallHooks: (id: string) =>
    http.delete<Project>(`/projects/${encodeURIComponent(id)}/hooks`).then((r) => r.data),

  /** FR-008 per-project "always allow model usage" */
  modelConsent: (id: string, opts: Opts = {}) =>
    http
      .get<ModelConsent>(`/projects/${encodeURIComponent(id)}/model-consent`, opts)
      .then((r) => r.data),

  /** PUT `{ alwaysAllow: false }` revokes */
  setModelConsent: (id: string, input: ModelConsentInput) =>
    http
      .put<ModelConsent>(`/projects/${encodeURIComponent(id)}/model-consent`, input)
      .then((r) => r.data),
};
