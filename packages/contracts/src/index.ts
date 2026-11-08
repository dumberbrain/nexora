/** Public API of @nexora/contracts — the single source of truth for server, web and MCP. */
export const CONTRACTS_VERSION = "0.1.0";

export * from "./enums";
export * from "./primitives";

export * from "./entities/capability";
export * from "./entities/project";
export * from "./entities/execution";
export * from "./entities/task";
export * from "./entities/session";
export * from "./entities/agent";
export * from "./entities/event";
export * from "./entities/message";
export * from "./entities/approval";
export * from "./entities/workflow";
export * from "./entities/integration";
export * from "./entities/audit";

export * from "./api/common";
export * from "./socket";
