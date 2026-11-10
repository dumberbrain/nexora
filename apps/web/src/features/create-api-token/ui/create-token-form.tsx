import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import {
  SCOPE_DESCRIPTION,
  type ApiTokenScope,
  type CreateApiTokenResult,
} from "@/entities/api-token";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/form/text-field";

import { TokenSecretDialog } from "./token-secret-dialog";
import {
  CREATE_TOKEN_DEFAULTS,
  CreateTokenFormSchema,
  type CreateTokenFormInput,
  type CreateTokenFormValues,
} from "../model/create-token.schema";
import { applyCreateTokenError } from "../model/server-error";
import { useCreateApiToken } from "../model/use-create-api-token";

const SCOPES: ApiTokenScope[] = ["read", "control"];

interface CreateTokenFormProps {
  /** MCP endpoint for the client config snippet next to the one-time secret */
  mcpEndpoint: string;
  className?: string;
}

/** Create a scoped API token; its secret is shown once in a dialog and then forgotten. */
export function CreateTokenForm({ mcpEndpoint, className }: CreateTokenFormProps) {
  const id = useId();
  const form = useForm<CreateTokenFormInput, unknown, CreateTokenFormValues>({
    resolver: zodResolver(CreateTokenFormSchema),
    defaultValues: CREATE_TOKEN_DEFAULTS,
  });
  const create = useCreateApiToken();
  const [created, setCreated] = useState<CreateApiTokenResult | null>(null);
  const { errors, isSubmitting } = form.formState;

  const submit = async (values: CreateTokenFormValues) => {
    try {
      setCreated(await create.mutateAsync(values));
      form.reset(CREATE_TOKEN_DEFAULTS);
    } catch (error) {
      applyCreateTokenError(form, error);
    }
  };

  const forgetSecret = () => {
    setCreated(null);
    create.reset();
  };

  return (
    <>
      <form
        noValidate
        aria-label="Create API token"
        onSubmit={(e) => void form.handleSubmit(submit)(e)}
        className={cn("flex flex-col gap-3", className)}
      >
        <TextField
          label="Token name"
          placeholder="claude-desktop"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          hint="Shown in the audit log as mcp_client:<name>."
          error={errors.name?.message}
          {...form.register("name")}
        />
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Scope
          </legend>
          {SCOPES.map((scope) => (
            <div key={scope} className="flex items-start gap-2">
              <input
                type="radio"
                id={`${id}-${scope}`}
                value={scope}
                aria-describedby={`${id}-${scope}-desc`}
                className="mt-1 accent-phosphor"
                {...form.register("scope")}
              />
              <div className="flex flex-col">
                <label htmlFor={`${id}-${scope}`} className="font-mono text-sm">
                  {scope}
                </label>
                <span id={`${id}-${scope}-desc`} className="text-xs text-muted-foreground">
                  {SCOPE_DESCRIPTION[scope]}
                </span>
              </div>
            </div>
          ))}
        </fieldset>
        {errors.root?.server ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {errors.root.server.message}
          </p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          className="w-fit rounded-sm"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          <KeyRoundIcon aria-hidden="true" />
          {isSubmitting ? "Creating…" : "Create token"}
        </Button>
      </form>
      <TokenSecretDialog created={created} mcpEndpoint={mcpEndpoint} onDone={forgetSecret} />
    </>
  );
}
