import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { openai } from "@/lib/openai";

const DIRECTORY = path.join(process.cwd(), "data", "recaps");
export const mediaId = /^[a-f0-9-]{36}\.mp3$/;
export const NARRATOR_VOICE = "shimmer" as const;

export async function narrate(text: string, welcome = false, id = `${randomUUID()}.mp3`): Promise<string> {
  const response = await openai().audio.speech.create({
    model: "gpt-4o-mini-tts", voice: NARRATOR_VOICE, input: text, response_format: "mp3",
    instructions: welcome
      ? "Use a soft, light, feminine voice with a warm, gentle smile. Relaxed, friendly and welcoming, with clear natural diction. Keep the volume and energy even. No deep register, booming announcer voice or exaggerated drama. Read only the provided words."
      : "Use a soft, light, feminine storytelling voice, like a friend catching someone up. Speak clearly at a natural conversational pace, with gentle expression and brief pauses. Let the humor feel understated. No deep booming register, trailer-announcer delivery, shouting, or forced urgency. Aim for about fifteen seconds. Read only the provided words.",
  }, { timeout: 30_000, maxRetries: 0 });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Narration was empty");
  await mkdir(DIRECTORY, { recursive: true });
  const temporary = path.join(DIRECTORY, `${id}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, path.join(DIRECTORY, id));
  } finally { await unlink(temporary).catch(() => undefined); }
  return `/api/recaps/${id}`;
}

export async function readRecapAudio(id: string): Promise<Buffer | null> {
  if (!mediaId.test(id)) return null;
  try { return await readFile(path.join(DIRECTORY, id)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function cleanRecapAudio(keepUrls: () => string[]): Promise<void> {
  let files: string[];
  try { files = await readdir(DIRECTORY); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  // Resolve live references after the directory read; new speech reserves its URL before writing.
  const keep = new Set(keepUrls().map((url) => url.split("/").at(-1)));
  await Promise.all(files.filter((file) => mediaId.test(file) && !keep.has(file))
    .map((file) => unlink(path.join(DIRECTORY, file)).catch(() => undefined)));
}
