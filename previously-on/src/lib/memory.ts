import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { bus, type ChatEvent } from "@/lib/bus";
import { generateSummary } from "@/lib/summary";
import { mergeJokes } from "@/lib/lore";

export type TranscriptLine = { t: string; text: string };
export type ChatLine = { t: string; user: string; text: string };
export type StreamSummary = {
  now: string;
  moments: Array<{ t: string; title: string; detail: string; clipId?: string }>;
  jokes: Array<{ term: string; explanation: string; firstSeen: string; clipId?: string }>;
};
export type MemoryContext = { summary: StreamSummary; transcript: TranscriptLine[]; chat: ChatLine[] };

type PendingTranscript = TranscriptLine & { id: number };
type PendingChat = ChatLine & { id: number };
type MemoryState = {
  transcript: TranscriptLine[];
  chat: ChatLine[];
  summary: StreamSummary;
  pendingTranscript: PendingTranscript[];
  pendingChat: PendingChat[];
  nextId: number;
};

const MEMORY_FILE = path.join(process.cwd(), "data", "memory.json");
const WINDOW_MS = 45 * 60_000;
const SUMMARY_INTERVAL_MS = 2 * 60_000;

function emptyState(): MemoryState {
  return {
    transcript: [],
    chat: [],
    summary: { now: "", moments: [], jokes: [] },
    pendingTranscript: [],
    pendingChat: [],
    nextId: 1,
  };
}

function validState(value: unknown): value is MemoryState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<MemoryState>;
  const transcript = (line: unknown): line is TranscriptLine =>
    !!line && typeof line === "object" &&
    typeof (line as TranscriptLine).t === "string" &&
    typeof (line as TranscriptLine).text === "string";
  const chat = (line: unknown): line is ChatLine =>
    transcript(line) && typeof (line as ChatLine).user === "string";
  const pending = (line: unknown): line is { id: number } =>
    !!line && typeof line === "object" &&
    Number.isSafeInteger((line as { id: number }).id) &&
    (line as { id: number }).id > 0;
  const moment = (item: unknown): item is StreamSummary["moments"][number] =>
    !!item && typeof item === "object" &&
    typeof (item as { t?: unknown }).t === "string" &&
    typeof (item as { title?: unknown }).title === "string" &&
    typeof (item as { detail?: unknown }).detail === "string";
  const joke = (item: unknown): item is StreamSummary["jokes"][number] =>
    !!item && typeof item === "object" &&
    typeof (item as { term?: unknown }).term === "string" &&
    typeof (item as { explanation?: unknown }).explanation === "string" &&
    typeof (item as { firstSeen?: unknown }).firstSeen === "string";
  const nextId = state.nextId;
  return (
    Array.isArray(state.transcript) &&
    state.transcript.every(transcript) &&
    Array.isArray(state.chat) &&
    state.chat.every(chat) &&
    !!state.summary &&
    typeof state.summary.now === "string" &&
    Array.isArray(state.summary.moments) &&
    state.summary.moments.every(moment) &&
    Array.isArray(state.summary.jokes) &&
    state.summary.jokes.every(joke) &&
    Array.isArray(state.pendingTranscript) &&
    state.pendingTranscript.every((line) => transcript(line) && pending(line)) &&
    Array.isArray(state.pendingChat) &&
    state.pendingChat.every((line) => chat(line) && pending(line)) &&
    typeof nextId === "number" &&
    Number.isSafeInteger(nextId) &&
    nextId > 0 &&
    [...state.pendingTranscript, ...state.pendingChat].every((line) => line.id < nextId)
  );
}

function recent<T extends { t: string }>(lines: T[], now: number): T[] {
  return lines.filter((line) => {
    const timestamp = Date.parse(line.t);
    return Number.isFinite(timestamp) && timestamp >= now - WINDOW_MS && timestamp <= now + 60_000;
  });
}

class StreamMemory {
  private state = emptyState();
  private readonly ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private summaryRun?: Promise<{ summary: StreamSummary; updated: boolean }>;

  constructor() {
    this.ready = this.load();
    bus.on("chat", (event) => {
      void this.addChat(event).catch(() => console.error("Saving chat memory failed"));
    });
    const timer = setInterval(() => {
      void this.summarizeNow().catch(() => console.error("Scheduled stream summary failed"));
    }, SUMMARY_INTERVAL_MS);
    timer.unref();
  }

  async start(): Promise<void> {
    await this.ready;
  }

  private async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(MEMORY_FILE, "utf8"));
      if (!validState(parsed)) throw new Error("data/memory.json has an invalid shape");
      this.state = parsed;
      if (this.prune()) await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private prune(): boolean {
    const before = this.state.transcript.length + this.state.chat.length +
      this.state.pendingTranscript.length + this.state.pendingChat.length;
    const now = Date.now();
    this.state.transcript = recent(this.state.transcript, now);
    this.state.chat = recent(this.state.chat, now);
    this.state.pendingTranscript = recent(this.state.pendingTranscript, now);
    this.state.pendingChat = recent(this.state.pendingChat, now);
    return before !== this.state.transcript.length + this.state.chat.length +
      this.state.pendingTranscript.length + this.state.pendingChat.length;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.state);
    const write = async () => {
      await mkdir(path.dirname(MEMORY_FILE), { recursive: true });
      const temporaryFile = `${MEMORY_FILE}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryFile, snapshot, { flag: "wx", mode: 0o600 });
        await rename(temporaryFile, MEMORY_FILE);
      } catch (error) {
        await unlink(temporaryFile).catch(() => undefined);
        throw error;
      }
    };
    const pending = this.writes.catch(() => undefined).then(write);
    this.writes = pending;
    return pending;
  }

  async addTranscript(text: string): Promise<void> {
    await this.ready;
    const line = { t: new Date().toISOString(), text };
    this.state.transcript.push(line);
    this.state.pendingTranscript.push({ ...line, id: this.state.nextId++ });
    this.prune();
    await this.persist();
  }

  private async addChat(event: ChatEvent): Promise<void> {
    if (event.chatterUserId === event.broadcasterUserId || event.text.trimStart().startsWith("!")) return;
    const text = event.text.trim();
    if (!text) return;
    await this.ready;
    const line = { t: new Date().toISOString(), user: event.chatterLogin, text };
    this.state.chat.push(line);
    this.state.pendingChat.push({ ...line, id: this.state.nextId++ });
    this.prune();
    await this.persist();
  }

  async getSummary(): Promise<StreamSummary> {
    await this.ready;
    return structuredClone(this.state.summary);
  }

  async getContext(minutes: number): Promise<MemoryContext> {
    await this.ready;
    if (this.prune()) await this.persist();
    const since = Date.now() - minutes * 60_000;
    return structuredClone({
      summary: this.state.summary,
      transcript: this.state.transcript.filter((line) => Date.parse(line.t) >= since),
      chat: this.state.chat.filter((line) => Date.parse(line.t) >= since),
    });
  }

  async summarizeNow(): Promise<{ summary: StreamSummary; updated: boolean }> {
    await this.ready;
    if (this.summaryRun) return this.summaryRun;
    const run = this.runSummary();
    this.summaryRun = run;
    try {
      return await run;
    } finally {
      if (this.summaryRun === run) this.summaryRun = undefined;
    }
  }

  private async runSummary(): Promise<{ summary: StreamSummary; updated: boolean }> {
    if (this.prune()) await this.persist();
    const transcript = [...this.state.pendingTranscript];
    const chat = [...this.state.pendingChat];
    if (!transcript.length && !chat.length) return { summary: await this.getSummary(), updated: false };

    const consumedId = Math.max(transcript.at(-1)?.id ?? 0, chat.at(-1)?.id ?? 0);
    const summary = await generateSummary(this.state.summary, transcript, chat);
    this.state.summary = summary;
    this.state.pendingTranscript = this.state.pendingTranscript.filter((line) => line.id > consumedId);
    this.state.pendingChat = this.state.pendingChat.filter((line) => line.id > consumedId);
    await this.persist();
    try {
      await mergeJokes(summary.jokes);
    } catch {
      console.error("Saving summary jokes to lore failed");
    }
    bus.emit("summary", structuredClone(summary));
    return { summary: structuredClone(summary), updated: true };
  }
}

type MemoryGlobal = typeof globalThis & { __previouslyOnMemory?: StreamMemory };
const memoryGlobal = globalThis as MemoryGlobal;

function memory(): StreamMemory {
  return (memoryGlobal.__previouslyOnMemory ??= new StreamMemory());
}

export async function startMemory(): Promise<void> {
  await memory().start();
}

export async function addTranscript(text: string): Promise<void> {
  await memory().addTranscript(text);
}

export async function getSummary(): Promise<StreamSummary> {
  return memory().getSummary();
}

export async function getMemoryContext(minutes: number): Promise<MemoryContext> {
  return memory().getContext(minutes);
}

export async function summarizeNow(): Promise<{ summary: StreamSummary; updated: boolean }> {
  return memory().summarizeNow();
}
