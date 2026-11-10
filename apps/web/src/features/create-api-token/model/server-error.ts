import { type UseFormReturn } from "react-hook-form";

import { ApiError } from "@/shared/api";

import { type CreateTokenFormInput, type CreateTokenFormValues } from "./create-token.schema";

/** Map a failed POST /tokens onto the form (409 / 400 → the name field; rest → root). */
export function applyCreateTokenError(
  form: UseFormReturn<CreateTokenFormInput, unknown, CreateTokenFormValues>,
  error: unknown,
): void {
  if (
    error instanceof ApiError &&
    (error.code === "CONFLICT" || error.code === "VALIDATION_FAILED")
  ) {
    form.setError("name", { type: "server", message: error.message }, { shouldFocus: true });
    return;
  }
  const message = error instanceof Error ? error.message : "Token creation failed";
  form.setError("root.server", { type: "server", message });
}
