import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { type Execution, type Question } from "@/entities/execution";
import { Button } from "@/shared/ui/button";

import { QuestionField } from "./question-field";
import {
  answersSchema,
  defaultValues,
  fieldName,
  toConfig,
  type AnswerValues,
} from "../../lib/questions";
import { useSaveConfig } from "../../model/use-save-config";

interface QuestionsFormProps {
  execution: Execution;
  questions: Question[];
  onSaved: (execution: Execution) => void;
}

/** Dynamic RHF form built from the server's questions; builds and saves the ExecutionConfig. */
export function QuestionsForm({ execution, questions, onSaved }: QuestionsFormProps) {
  const form = useForm<AnswerValues>({
    resolver: zodResolver(answersSchema(questions)),
    defaultValues: defaultValues(questions),
  });
  const save = useSaveConfig(execution.id);
  const { errors, isSubmitting } = form.formState;

  const submit = async (values: AnswerValues) => {
    try {
      onSaved(await save.mutateAsync(toConfig(execution.config, questions, values)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Saving the answers failed";
      form.setError("root.server", { type: "server", message });
    }
  };

  return (
    <form
      noValidate
      aria-label="Follow-up questions"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className="flex flex-col gap-3"
    >
      {questions.map((q, i) => {
        const name = fieldName(i);
        const message = errors[name]?.message;
        return (
          <QuestionField
            key={q.key}
            question={q}
            name={name}
            register={form.register}
            error={typeof message === "string" ? message : undefined}
          />
        );
      })}
      {errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={isSubmitting} className="self-start rounded-sm">
        {isSubmitting ? "Saving…" : "Save answers"}
        <ArrowRightIcon aria-hidden="true" />
      </Button>
    </form>
  );
}
