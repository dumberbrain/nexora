import { queryOptions } from "@tanstack/react-query";

import { executionApi } from "./execution.api";
import {
  DERIVED_CACHE,
  EXECUTION_CACHE,
  executionKeys,
  RUNTIME_CACHE,
  runtimeKeys,
} from "./query-keys";

/** Newest first (server order). */
export const executionListQuery = () =>
  queryOptions({
    queryKey: executionKeys.lists(),
    queryFn: ({ signal }) => executionApi.list({ signal }),
    ...EXECUTION_CACHE,
  });

export const executionDetailQuery = (id: string) =>
  queryOptions({
    queryKey: executionKeys.detail(id),
    queryFn: ({ signal }) => executionApi.byId(id, { signal }),
    ...EXECUTION_CACHE,
  });

export const executionModesQuery = (id: string) =>
  queryOptions({
    queryKey: executionKeys.modes(id),
    queryFn: ({ signal }) => executionApi.modes(id, { signal }),
    ...DERIVED_CACHE,
  });

export const executionQuestionsQuery = (id: string) =>
  queryOptions({
    queryKey: executionKeys.questions(id),
    queryFn: ({ signal }) => executionApi.questions(id, { signal }),
    ...DERIVED_CACHE,
  });

export const verificationQuery = (id: string) =>
  queryOptions({
    queryKey: executionKeys.verification(id),
    queryFn: ({ signal }) => executionApi.verification(id, { signal }),
    ...DERIVED_CACHE,
  });

export const runtimeEnvironmentQuery = () =>
  queryOptions({
    queryKey: runtimeKeys.environment(),
    queryFn: ({ signal }) => executionApi.runtimeEnvironment({ signal }),
    ...RUNTIME_CACHE,
  });
