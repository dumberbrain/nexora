/** `multi_session` → `multi session` — readable labels for snake_case enum values. */
export function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
