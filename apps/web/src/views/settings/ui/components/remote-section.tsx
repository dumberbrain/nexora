import { REMOTE_ENV_VARS, type Settings } from "@/entities/settings";
import { cn } from "@/shared/lib/cn";

import { Section } from "./section";

function Fact({ label, value, tone }: { label: string; value: string; tone?: string | undefined }) {
  return (
    <li className="flex flex-col gap-0.5 border border-border px-3 py-2">
      <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      <span className={cn("font-mono text-sm", tone)}>{value}</span>
    </li>
  );
}

/** FR-050: remote access is configured by env vars only — this section is read-only. */
export function RemoteSection({ remote }: { remote: Settings["remote"] }) {
  return (
    <Section
      title="Remote access"
      description="Read-only. Nexora binds to loopback unless remote access is enabled with environment variables before start-up. Never expose it directly to the public internet."
    >
      <ul aria-label="Remote access status" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Status"
          value={remote.enabled ? "enabled" : "loopback only"}
          tone={remote.enabled ? "text-status-waiting" : undefined}
        />
        <Fact label="Host" value={remote.host} />
        <Fact label="Port" value={String(remote.port)} />
        <Fact
          label="Env token"
          value={remote.envTokenConfigured ? "configured" : "not configured"}
        />
      </ul>
      <dl
        aria-label="Environment variables"
        className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]"
      >
        {REMOTE_ENV_VARS.map((v) => (
          <div key={v.name} className="contents">
            <dt>
              <code className="font-mono text-xs text-phosphor">{v.name}</code>
            </dt>
            <dd className="text-xs text-muted-foreground">{v.hint}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
