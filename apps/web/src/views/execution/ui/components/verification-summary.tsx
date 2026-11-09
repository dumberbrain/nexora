import { type Verification } from "@/entities/execution";

function IdList({ ids }: { ids: readonly string[] }) {
  return ids.length > 0 ? (
    <>{ids.join(", ")}</>
  ) : (
    <span className="text-muted-foreground">none</span>
  );
}

/** Final summary (US2-AS7): completed/failed tasks, changed files and test counts. */
export function VerificationSummary({ verification }: { verification: Verification | null }) {
  return (
    <section
      aria-label="Verification"
      className="flex flex-col gap-3 border border-border bg-card p-4"
    >
      <h2 className="text-sm tracking-widest">Verification</h2>
      {verification === null ? (
        <p className="font-mono text-xs text-muted-foreground">
          Verification has not produced a summary yet.
        </p>
      ) : (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 font-mono text-[11px]">
          <dt className="text-muted-foreground">completed</dt>
          <dd className="text-status-completed">
            <IdList ids={verification.completedTaskIds} />
          </dd>
          <dt className="text-muted-foreground">failed</dt>
          <dd className="text-status-failed">
            <IdList ids={verification.failedTaskIds} />
          </dd>
          <dt className="text-muted-foreground">tests</dt>
          <dd>
            {verification.testResults ? (
              <span className="flex flex-wrap gap-3 tabular-nums">
                <span className="text-status-completed">
                  {verification.testResults.passed} passed
                </span>
                <span className="text-status-failed">{verification.testResults.failed} failed</span>
                <span className="text-muted-foreground">
                  {verification.testResults.skipped} skipped
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">not run (opt-in during configuration)</span>
            )}
          </dd>
          <dt className="text-muted-foreground">changed files</dt>
          <dd className="min-w-0">
            {verification.changedFiles.length > 0 ? (
              <ul className="flex flex-col gap-0.5 break-all">
                {verification.changedFiles.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </dd>
        </dl>
      )}
    </section>
  );
}
