import { randomUUID } from "node:crypto";
import { readFile, rename } from "node:fs/promises";

/** Recover malformed saves without logging their contents or losing the original file. */
export async function loadSavedState<T>(file: string, valid: (value: unknown) => value is T, fresh: () => T): Promise<T> {
  let raw: string;
  try { raw = await readFile(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Saved state could not be read; starting fresh");
    return fresh();
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (valid(value)) return value;
  } catch { /* Malformed JSON is recovered just like an invalid schema. */ }
  await rename(file, `${file}.corrupt-${randomUUID()}`).catch(() => undefined);
  console.warn("Invalid saved state preserved where possible; starting fresh");
  return fresh();
}
