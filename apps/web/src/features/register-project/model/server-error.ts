import { type UseFormReturn } from "react-hook-form";

import { ApiError } from "@/shared/api";

import { type RegisterProjectFormValues } from "./register-project.schema";

/** Map a failed POST /projects onto the form (409 / 400 / 404 → the path field; rest → root). */
export function applyRegisterError(
  form: UseFormReturn<RegisterProjectFormValues>,
  error: unknown,
): void {
  if (error instanceof ApiError) {
    if (error.code === "CONFLICT") {
      form.setError(
        "rootPath",
        { type: "server", message: "This folder is already registered." },
        { shouldFocus: true },
      );
      return;
    }
    if (error.code === "VALIDATION_FAILED" || error.code === "NOT_FOUND") {
      form.setError("rootPath", { type: "server", message: error.message }, { shouldFocus: true });
      return;
    }
  }
  const message = error instanceof Error ? error.message : "Registration failed";
  form.setError("root.server", { type: "server", message });
}
