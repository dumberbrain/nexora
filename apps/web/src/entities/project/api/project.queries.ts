import { queryOptions } from "@tanstack/react-query";

import { projectApi } from "./project.api";
import { PROJECT_CACHE, projectKeys } from "./query-keys";

export const projectListQuery = () =>
  queryOptions({
    queryKey: projectKeys.lists(),
    queryFn: ({ signal }) => projectApi.list({ signal }),
    ...PROJECT_CACHE,
  });

/** The preview must reflect the file on disk right now — never served from cache. */
export const hookPreviewQuery = (projectId: string) =>
  queryOptions({
    queryKey: projectKeys.hookPreview(projectId),
    queryFn: ({ signal }) => projectApi.hookPreview(projectId, { signal }),
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });
