import { type SetupStep } from "@/entities/execution";
import { cn } from "@/shared/lib/cn";

const LABEL: Record<SetupStep, string> = {
  task: "Describe task",
  mode: "Choose mode",
  questions: "Answer questions",
  plan: "Review & approve plan",
};

const ORDER: SetupStep[] = ["task", "mode", "questions", "plan"];

/** Wizard progress: [01]…[04]; the current step carries aria-current="step". */
export function WizardSteps({ current }: { current: SetupStep }) {
  const at = ORDER.indexOf(current);
  return (
    <ol aria-label="Wizard steps" className="flex flex-wrap gap-2 font-mono text-[11px] uppercase">
      {ORDER.map((step, i) => (
        <li
          key={step}
          aria-current={i === at ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5 border px-2 py-1 tracking-wider",
            i === at && "border-phosphor text-phosphor shadow-glow",
            i < at && "border-border text-foreground",
            i > at && "border-dashed border-border text-muted-foreground",
          )}
        >
          <span aria-hidden="true">[{String(i + 1).padStart(2, "0")}]</span>
          {LABEL[step]}
          {i < at ? <span className="sr-only"> (done)</span> : null}
        </li>
      ))}
    </ol>
  );
}
