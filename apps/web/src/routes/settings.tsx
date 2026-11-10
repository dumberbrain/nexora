import { createFileRoute } from "@tanstack/react-router";

import { loadSettings, SettingsView } from "@/views/settings";

export const Route = createFileRoute("/settings")({
  loader: ({ context }) => loadSettings(context.queryClient),
  component: SettingsView,
});
