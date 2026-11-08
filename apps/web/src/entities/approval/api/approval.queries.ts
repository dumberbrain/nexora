import { queryOptions } from "@tanstack/react-query";

import { approvalApi } from "./approval.api";
import { APPROVAL_CACHE, approvalKeys } from "./query-keys";
import { type ApprovalListFilters } from "../model/types";

export const approvalListQuery = (filters: ApprovalListFilters = {}) =>
  queryOptions({
    queryKey: approvalKeys.list(filters),
    queryFn: ({ signal }) => approvalApi.list(filters, { signal }),
    ...APPROVAL_CACHE,
  });
