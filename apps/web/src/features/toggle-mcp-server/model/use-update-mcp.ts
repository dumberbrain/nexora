import { useMutation, useQueryClient } from "@tanstack/react-query";

import { settingsApi, settingsKeys } from "@/entities/settings";

/** PUT /settings/mcp `{ enabled }` — the answer is the full Settings, written straight to cache. */
export function useUpdateMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: settingsKeys.updateMcp(),
    mutationFn: (enabled: boolean) => settingsApi.updateMcp({ enabled }),
    onSuccess: (settings) => qc.setQueryData(settingsKeys.current(), settings),
  });
}
