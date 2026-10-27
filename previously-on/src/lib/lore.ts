import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { bus } from "@/lib/bus";
import type { StreamSummary } from "@/lib/memory";
import { loadSavedState } from "@/lib/saved-state";

export type LoreEntry = {
  id: string;
  term: string;
  explanation: string;
  firstSeen: string;
  clipId?: string;
  edited?: boolean;
};

type LoreFile = { entries: LoreEntry[]; dismissedTerms: string[] };
type Joke = StreamSummary["jokes"][number];

const LORE_FILE = path.join(process.cwd(), "data", "lore.json");
const FILLER = new Set(["a", "an", "the", "thing", "joke", "bit"]);

export function loreKey(term: string): string {
  const words = term.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [];
  const useful = words.filter((word) => !FILLER.has(word));
  return (useful.length ? useful : words).join(" ");
}

export function validClipId(value: string): boolean {
  return value === "" || /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function validEntry(value: unknown): value is LoreEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<LoreEntry>;
  return typeof entry.id === "string" && typeof entry.term === "string" &&
    typeof entry.explanation === "string" && typeof entry.firstSeen === "string" &&
    (entry.clipId === undefined || typeof entry.clipId === "string") &&
    (entry.edited === undefined || typeof entry.edited === "boolean");
}

function validFile(value: unknown): value is LoreFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<LoreFile>;
  return Array.isArray(file.entries) && file.entries.every(validEntry) &&
    Array.isArray(file.dismissedTerms) && file.dismissedTerms.every((term) => typeof term === "string");
}

function earliest(first: string, second: string): string {
  const a = Date.parse(first);
  const b = Date.parse(second);
  if (!Number.isFinite(a)) return second;
  if (!Number.isFinite(b)) return first;
  return a <= b ? first : second;
}

function clearlyBetter(existing: string, candidate: string): boolean {
  const oldText = existing.trim();
  const newText = candidate.trim();
  if (/^(unknown|not sure|unclear|tbd)[.!]?$/i.test(oldText)) return newText.length >= 30;
  const oldFacts = loreKey(oldText).split(" ").filter((word) => word.length >= 4);
  const newWords = new Set(loreKey(newText).split(" "));
  return oldText.length < 100 && newText.length >= 90 &&
    newText.length >= oldText.length * 2 &&
    oldFacts.every((word) => newWords.has(word)) &&
    !/^(unknown|not sure|unclear|tbd)[.!]?$/i.test(newText);
}

function matchScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1_000;
  const queryWords = query.split(" ");
  const candidateWords = candidate.split(" ");
  if (queryWords.every((word) => candidateWords.includes(word))) {
    return 500 - (candidateWords.length - queryWords.length);
  }
  if (candidateWords.every((word) => queryWords.includes(word))) {
    return 300 - (queryWords.length - candidateWords.length);
  }
  return 0;
}

export function findSummaryJoke(term: string, jokes: Joke[]): Joke | null {
  const key = loreKey(term);
  let best: Joke | null = null;
  let score = 0;
  for (const joke of jokes) {
    const next = matchScore(key, loreKey(joke.term));
    if (next > score) {
      best = joke;
      score = next;
    }
  }
  return best;
}

class LoreStore {
  private file: LoreFile = { entries: [], dismissedTerms: [] };
  private readonly ready = this.load();
  private operations: Promise<void> = Promise.resolve();

  private async load(): Promise<void> {
    this.file = await loadSavedState(LORE_FILE, validFile, () => ({ entries: [], dismissedTerms: [] }));
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(LORE_FILE), { recursive: true });
    const temporaryFile = `${LORE_FILE}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryFile, JSON.stringify(this.file), { flag: "wx", mode: 0o600 });
      await rename(temporaryFile, LORE_FILE);
    } catch (error) {
      await unlink(temporaryFile).catch(() => undefined);
      throw error;
    }
  }

  private mutate<T>(change: () => T | Promise<T>, shouldSave: (result: T) => boolean = () => true): Promise<T> {
    const operation = this.operations.catch(() => undefined).then(async () => {
      await this.ready;
      const result = await change();
      if (shouldSave(result)) {
        await this.save();
        bus.emit("lore", structuredClone(this.file.entries));
      }
      return result;
    });
    this.operations = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async list(): Promise<LoreEntry[]> {
    await this.ready;
    await this.operations;
    return structuredClone(this.file.entries);
  }

  async find(term: string): Promise<LoreEntry | null> {
    await this.ready;
    await this.operations;
    const key = loreKey(term);
    if (this.file.dismissedTerms.some((dismissed) => matchScore(key, dismissed) >= 490)) return null;
    let best: LoreEntry | null = null;
    let score = 0;
    for (const entry of this.file.entries) {
      const next = matchScore(key, loreKey(entry.term));
      if (next > score) {
        best = entry;
        score = next;
      }
    }
    return best ? structuredClone(best) : null;
  }

  async isDismissed(term: string): Promise<boolean> {
    await this.ready;
    await this.operations;
    const key = loreKey(term);
    return this.file.dismissedTerms.some((dismissed) => matchScore(key, dismissed) >= 490);
  }

  async merge(jokes: Joke[]): Promise<void> {
    await this.ready;
    await this.operations;
    const additions = jokes.filter((joke) => {
      const key = loreKey(joke.term);
      return key && joke.explanation.trim() && Number.isFinite(Date.parse(joke.firstSeen)) &&
        !this.file.dismissedTerms.some((dismissed) => matchScore(key, dismissed) >= 490);
    });
    if (!additions.length) return;
    await this.mutate(() => {
      let changed = false;
      for (const joke of additions) {
        const key = loreKey(joke.term);
        if (this.file.dismissedTerms.some((dismissed) => matchScore(key, dismissed) >= 490)) continue;
        const existing = this.file.entries.find((entry) => matchScore(key, loreKey(entry.term)) >= 490);
        if (existing) {
          if (existing.edited) continue;
          const firstSeen = earliest(existing.firstSeen, joke.firstSeen);
          if (firstSeen !== existing.firstSeen) { existing.firstSeen = firstSeen; changed = true; }
          if (!existing.clipId && joke.clipId && validClipId(joke.clipId)) {
            existing.clipId = joke.clipId;
            changed = true;
          }
          if (clearlyBetter(existing.explanation, joke.explanation)) {
            existing.explanation = joke.explanation.trim();
            changed = true;
          }
        } else {
          this.file.entries.push({
            id: randomUUID(),
            term: joke.term.trim(),
            explanation: joke.explanation.trim(),
            firstSeen: joke.firstSeen,
            ...(joke.clipId && validClipId(joke.clipId) ? { clipId: joke.clipId } : {}),
          });
          changed = true;
        }
      }
      return changed;
    }, (changed) => changed);
  }

  async update(id: string, fields: Omit<LoreEntry, "id" | "edited">): Promise<LoreEntry> {
    return this.mutate(() => {
      const entry = this.file.entries.find((item) => item.id === id);
      if (!entry) throw new Error("Lore entry not found");
      const newKey = loreKey(fields.term);
      if (this.file.entries.some((item) => item.id !== id && loreKey(item.term) === newKey)) {
        throw new Error("A lore entry with that term already exists");
      }
      const oldKey = loreKey(entry.term);
      if (oldKey !== newKey && !this.file.dismissedTerms.includes(oldKey)) {
        this.file.dismissedTerms.push(oldKey);
      }
      this.file.dismissedTerms = this.file.dismissedTerms.filter((term) => term !== newKey);
      Object.assign(entry, fields, { edited: true });
      if (!fields.clipId) delete entry.clipId;
      return structuredClone(entry);
    });
  }

  async delete(id: string): Promise<void> {
    await this.mutate(() => {
      const index = this.file.entries.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Lore entry not found");
      const [entry] = this.file.entries.splice(index, 1);
      const key = loreKey(entry.term);
      if (!this.file.dismissedTerms.includes(key)) this.file.dismissedTerms.push(key);
    });
  }
}

type LoreGlobal = typeof globalThis & { __previouslyOnLore?: LoreStore };
const loreGlobal = globalThis as LoreGlobal;
const lore = () => (loreGlobal.__previouslyOnLore ??= new LoreStore());

export const getLore = () => lore().list();
export const findLore = (term: string) => lore().find(term);
export const isLoreDismissed = (term: string) => lore().isDismissed(term);
export const mergeJokes = (jokes: Joke[]) => lore().merge(jokes);
export const updateLore = (id: string, fields: Omit<LoreEntry, "id" | "edited">) => lore().update(id, fields);
export const deleteLore = (id: string) => lore().delete(id);
