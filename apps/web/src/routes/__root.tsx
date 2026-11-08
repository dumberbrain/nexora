import { createRootRouteWithContext } from "@tanstack/react-router";

import { RootLayout } from "@/app/layout/root-layout";
import { type RouterContext } from "@/app/router-context";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
