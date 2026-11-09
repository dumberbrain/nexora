import { type LinkProps } from "@tanstack/react-router";

export interface NavItem {
  index: string;
  label: string;
  /** route path once the view exists; items without one render disabled (no fake pages) */
  to?: LinkProps["to"];
  /** user story that delivers the view — shown while unavailable */
  story: string;
}

/** Dashboard pages (FR-023) in reactivite /SLASH style. */
export const NAV_ITEMS: NavItem[] = [
  { index: "01", label: "overview", to: "/", story: "US1" },
  { index: "02", label: "canvas", to: "/canvas", story: "US1" },
  { index: "03", label: "sessions", to: "/sessions", story: "US1" },
  { index: "04", label: "tasks", to: "/tasks", story: "US4" },
  { index: "05", label: "workflows", story: "US5" },
  { index: "06", label: "comms", to: "/communication", story: "US3" },
  { index: "07", label: "logs", to: "/logs", story: "US1" },
  { index: "08", label: "skills & mcp", story: "US7" },
  { index: "09", label: "github", story: "US7" },
];
