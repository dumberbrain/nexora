import { useQuery } from "@tanstack/react-query";

import { apiTokenListQuery } from "@/entities/api-token";
import { CreateTokenForm } from "@/features/create-api-token";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/state";

import { Section } from "./section";
import { TokenRow } from "./token-row";

/** Create (secret shown once), list and revoke API tokens. Session cookie only (FR-052). */
export function TokensSection({ mcpEndpoint }: { mcpEndpoint: string }) {
  const tokens = useQuery(apiTokenListQuery());
  return (
    <Section
      title="API tokens"
      description="Bearer tokens for MCP clients. read: status and logs only. control: can also start and stop executions. Secrets are shown once and stored as a sha-256 hash; tokens can never manage tokens or settings."
    >
      <CreateTokenForm mcpEndpoint={mcpEndpoint} className="max-w-md" />
      {tokens.isPending ? <LoadingState label="Loading API tokens" rows={2} /> : null}
      {tokens.isError ? (
        <ErrorState
          title="API tokens unavailable"
          error={tokens.error}
          onRetry={() => void tokens.refetch()}
        />
      ) : null}
      {tokens.data && tokens.data.items.length === 0 ? (
        <EmptyState title="No API tokens yet" description="Create one to connect an MCP client." />
      ) : null}
      {tokens.data && tokens.data.items.length > 0 ? (
        <ul aria-label="API tokens" className="flex flex-col border border-border">
          {tokens.data.items.map((token) => (
            <TokenRow key={token.id} token={token} />
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
