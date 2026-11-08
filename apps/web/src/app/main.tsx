import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { initThemeSync } from "@/features/toggle-theme";
import { queryClient } from "@/shared/api";
import { connectLiveSocket, getLiveSocket } from "@/shared/socket/client";

import { Providers } from "./providers";
import { router } from "./router";
import { startSocketBridge } from "./socket-bridge";

import "./styles/globals.css";

// One-time bootstrap of external systems (outside React): theme ↔ <html>, realtime ↔ query cache.
initThemeSync();
startSocketBridge(queryClient, getLiveSocket());
void connectLiveSocket();

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing in index.html");

createRoot(container).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
