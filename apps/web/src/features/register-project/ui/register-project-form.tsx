import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { type Project } from "@/entities/project";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form/text-field";

import {
  RegisterProjectFormSchema,
  toRegisterInput,
  type RegisterProjectFormValues,
} from "../model/register-project.schema";
import { applyRegisterError } from "../model/server-error";
import { useRegisterProject } from "../model/use-register-project";

interface RegisterProjectFormProps {
  onRegistered?: (project: Project) => void;
  className?: string;
}

const DEFAULTS: RegisterProjectFormValues = { rootPath: "", name: "" };

/** Register a local project folder so Ubuliera can attribute observed sessions to it. */
export function RegisterProjectForm({ onRegistered, className }: RegisterProjectFormProps) {
  const form = useForm<RegisterProjectFormValues>({
    resolver: zodResolver(RegisterProjectFormSchema),
    defaultValues: DEFAULTS,
  });
  const register = useRegisterProject();
  const { errors, isSubmitting } = form.formState;

  const submit = async (values: RegisterProjectFormValues) => {
    try {
      const project = await register.mutateAsync(toRegisterInput(values));
      toast.success(`Registered ${project.name}`);
      form.reset(DEFAULTS);
      onRegistered?.(project);
    } catch (error) {
      applyRegisterError(form, error);
    }
  };

  return (
    <form
      noValidate
      aria-label="Register project"
      onSubmit={(e) => void form.handleSubmit(submit)(e)}
      className={cn("flex flex-col gap-3", className)}
    >
      <TextField
        label="Project folder (absolute path)"
        placeholder="C:\\work\\my-app or /home/me/my-app"
        autoComplete="off"
        spellCheck={false}
        error={errors.rootPath?.message}
        {...form.register("rootPath")}
      />
      <TextField
        label="Display name (optional)"
        placeholder="defaults to the folder name"
        autoComplete="off"
        error={errors.name?.message}
        {...form.register("name")}
      />
      {errors.root?.server ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {errors.root.server.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={isSubmitting} className="self-start rounded-sm">
        <FolderPlusIcon aria-hidden="true" />
        {isSubmitting ? "Registering…" : "Register project"}
      </Button>
    </form>
  );
}
