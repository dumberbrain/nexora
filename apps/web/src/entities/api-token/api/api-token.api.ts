import { http } from "@/shared/api";

import {
  type ApiToken,
  type ApiTokenList,
  type CreateApiTokenInput,
  type CreateApiTokenResult,
} from "../model/types";

type Opts = { signal?: AbortSignal };

/** Token management is session-cookie only: bearer tokens can never call these (server-enforced). */
export const apiTokenApi = {
  /** GET /tokens — newest first, revoked included, never any secret. */
  list: (opts: Opts = {}) => http.get<ApiTokenList>("/tokens", opts).then((r) => r.data),
  /** POST /tokens → 201 `{ token, secret }`; the secret is returned only here, never again. */
  create: (input: CreateApiTokenInput) =>
    http.post<CreateApiTokenResult>("/tokens", input).then((r) => r.data),
  /** DELETE /tokens/:id — revoke (idempotent), answers the revoked ApiToken. */
  revoke: (id: string) =>
    http.delete<ApiToken>(`/tokens/${encodeURIComponent(id)}`).then((r) => r.data),
};
