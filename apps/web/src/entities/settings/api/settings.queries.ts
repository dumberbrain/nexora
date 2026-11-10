import { queryOptions } from "@tanstack/react-query";

import { SETTINGS_CACHE, settingsKeys } from "./query-keys";
import { settingsApi } from "./settings.api";

export const settingsQuery = () =>
  queryOptions({
    queryKey: settingsKeys.current(),
    queryFn: ({ signal }) => settingsApi.get({ signal }),
    ...SETTINGS_CACHE,
  });
