import { CreateApiTokenInputSchema } from "@nexora/contracts";
import { type z } from "zod";

/** The form validates with the contract schema itself (trimmed name, charset, read|control). */
export const CreateTokenFormSchema = CreateApiTokenInputSchema;
export type CreateTokenFormInput = z.input<typeof CreateTokenFormSchema>;
export type CreateTokenFormValues = z.output<typeof CreateTokenFormSchema>;

export const CREATE_TOKEN_DEFAULTS: CreateTokenFormInput = { name: "", scope: "read" };
