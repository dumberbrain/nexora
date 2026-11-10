import { GITHUB_AUTH_HINT, GITHUB_INSTALL_HINT } from "@ubuliera/contracts";
import { useId } from "react";

import { type GithubStatus } from "@/entities/github";
import { Button } from "@/shared/ui/button";

import { CopyCommand } from "./copy-command";

interface SetupCardProps {
  status: GithubStatus;
  checking: boolean;
  onCheckAgain: () => void;
}

/**
 * Guidance when gh is missing or signed out. Ubuliera never installs or signs in for the user —
 * it shows the commands to run, then re-checks the status on demand.
 */
export function SetupCard({ status, checking, onCheckAgain }: SetupCardProps) {
  const id = useId();
  const installing = status.status === "not_installed";
  const steps = installing
    ? [status.hint ?? GITHUB_INSTALL_HINT, GITHUB_AUTH_HINT]
    : [status.hint ?? GITHUB_AUTH_HINT];

  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 border border-dashed border-phosphor/50 p-4"
    >
      <span className="text-index" aria-hidden="true">
        [setup]
      </span>
      <h2 id={id} className="text-xl text-foreground">
        {installing ? "Install the GitHub CLI" : "Sign in to GitHub"}
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        {installing
          ? "Branches, commits and pull requests are read through the GitHub CLI (gh). Install it, sign in, then check again."
          : "The GitHub CLI is installed but not signed in. Run this in a terminal, then check again."}
      </p>
      <ol className="flex flex-col gap-2">
        {steps.map((cmd) => (
          <li key={cmd}>
            <CopyCommand command={cmd} />
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={checking}
        onClick={onCheckAgain}
      >
        Check again
      </Button>
    </section>
  );
}
