/**
 * Escape ILIKE metacharacters in user-supplied input.
 *
 * PostgreSQL's ILIKE treats `%` as "any string" and `_` as "any single character".
 * If user input contains these characters, they must be escaped with `\` so they
 * are matched literally. The backslash itself must also be escaped.
 */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
