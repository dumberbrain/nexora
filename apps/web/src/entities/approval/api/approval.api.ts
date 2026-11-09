import { http } from "@/shared/api";

import {
  type ApprovalDecisionInput,
  type ApprovalList,
  type ApprovalListFilters,
  type ApprovalRequest,
} from "../model/types";

type Opts = { signal?: AbortSignal };

export const approvalApi = {
  list: (filters: ApprovalListFilters = {}, opts: Opts = {}) =>
    http
      .get<ApprovalList>("/approvals", {
        params: filters.status ? { status: filters.status } : {},
        ...opts,
      })
      .then((r) => r.data),

  /** explicit human decision (FR-033) */
  decide: (id: string, input: ApprovalDecisionInput) =>
    http
      .post<ApprovalRequest>(`/approvals/${encodeURIComponent(id)}/decision`, input)
      .then((r) => r.data),
};
