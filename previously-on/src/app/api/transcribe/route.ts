import { addTranscript } from "@/lib/memory";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function usefulText(text: string): boolean {
  const clean = text.trim();
  if (!/[\p{L}\p{N}]/u.test(clean)) return false;
  if (/^(\[(?:music|silence|applause|noise)\]|\((?:music|silence|applause|noise)\))\.?$/iu.test(clean)) return false;
  if (/^(thank you for watching|thanks for watching|subscribe to the channel)\.?$/iu.test(clean)) return false;
  return true;
}

export async function POST(request: Request): Promise<Response> {
  let audio: FormDataEntryValue | null;
  try {
    audio = (await request.formData()).get("audio");
  } catch {
    return Response.json({ error: "Invalid multipart upload" }, { status: 400 });
  }
  if (!(audio instanceof File) || !audio.type.startsWith("audio/") || audio.size === 0) {
    return Response.json({ error: "An audio file is required" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio exceeds the 25 MB limit" }, { status: 413 });
  }

  try {
    const transcription = await openai().audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe",
    });
    const text = transcription.text?.trim() ?? "";
    if (!usefulText(text)) return Response.json({ accepted: false });
    await addTranscript(text);
    return Response.json({ accepted: true });
  } catch {
    console.error("Audio transcription failed");
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }
}
