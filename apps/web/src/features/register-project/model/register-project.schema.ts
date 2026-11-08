import { RegisterProjectInputSchema, type RegisterProjectInput } from "@nexora/contracts";
import { z } from "zod";

/**
 * Form shape: same constraints as the contract, but the optional name is an always-present text
 * field ("" = let the server derive it from the folder name).
 */
export const RegisterProjectFormSchema = z.object({
  rootPath: RegisterProjectInputSchema.shape.rootPath,
  name: z.string().trim().max(120, "at most 120 characters"),
});
export type RegisterProjectFormValues = z.infer<typeof RegisterProjectFormSchema>;

export function toRegisterInput(values: RegisterProjectFormValues): RegisterProjectInput {
  const name = values.name.trim();
  return name ? { rootPath: values.rootPath, name } : { rootPath: values.rootPath };
}
