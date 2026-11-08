import { z } from "zod";

/** Crockford base32 ULID, 26 chars — sortable ids and the event replay cursor. */
export const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "must be a ULID");
export type Ulid = z.infer<typeof UlidSchema>;

/** Milliseconds since the Unix epoch (UTC). */
export const EpochMsSchema = z.number().int().nonnegative();

const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/;

/** True for `/x`, `C:\x`, `C:/x` and UNC `\\server\share` paths. */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || WINDOWS_ABSOLUTE.test(value);
}

/**
 * Absolute filesystem path without `..` segments. Real normalisation and the
 * "inside a registered project root" check happen server-side (lib/path-guard).
 */
export const AbsolutePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(isAbsolutePath, "must be an absolute path")
  .refine((p) => !p.split(/[\\/]/).includes(".."), "must not contain '..' segments");

/** Arbitrary JSON value (already redacted when it leaves the server). */
export const JsonValueSchema: z.ZodType<unknown> = z.unknown();
