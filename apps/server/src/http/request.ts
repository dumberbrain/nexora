import { type Context } from "hono";

import { AppError } from "./errors";

/** Request JSON body; malformed JSON is a 400, never a 500. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new AppError("VALIDATION_FAILED", "Request body must be valid JSON");
  }
}
