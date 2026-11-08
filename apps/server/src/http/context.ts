/** Hono context variables set by the auth middleware. */
export type AuthMethod = "session" | "bearer";

export interface AppBindings {
  Variables: {
    /** audit actor: `user` or `mcp_client:<token name>` */
    actor: string;
    authMethod: AuthMethod;
  };
}
