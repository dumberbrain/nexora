import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { resetSettings, resetTaskBoard, resetWorkflows } from "./msw/handlers";
import { server } from "./msw/server";

// jsdom has no ResizeObserver; Radix form controls (Switch/Checkbox inside a <form>) measure
// themselves with it. A no-op is enough — layout is never asserted in component tests.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

// Unhandled requests fail the test — every network call in a component test must be mocked.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetTaskBoard();
  resetWorkflows();
  resetSettings();
  cleanup();
});
afterAll(() => server.close());
