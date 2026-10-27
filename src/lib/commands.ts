import { bus, type ChatEvent } from "@/lib/bus";
import { askUnknownLore, makeCatchup, plainText } from "@/lib/chat-answers";
import { findLore, findSummaryJoke, getLore, isLoreDismissed, loreKey, mergeJokes, validClipId } from "@/lib/lore";
import { getSummary } from "@/lib/memory";
import { sendChat } from "@/lib/twitch/chat";

type Command = { name: "ping" | "catchup" | "lore"; term: string };

const USER_COOLDOWN_MS = 20_000;
const GLOBAL_COOLDOWN_MS = 3_000;
const CATCHUP_CACHE_MS = 60_000;

function parseCommand(text: string): Command | null {
  const match = /^!(ping|catchup|lore)(?:\s+(.*))?$/i.exec(text.trim());
  if (!match) return null;
  return { name: match[1].toLowerCase() as Command["name"], term: (match[2] ?? "").trim() };
}

class ChatCommands {
  private readonly usedAt = new Map<string, number>();
  private acceptedAt = 0;
  private sentAt = 0;
  private sendQueue: Promise<void> = Promise.resolve();
  private catchupCache?: { answer: string; expiresAt: number };
  private catchupPending?: Promise<string>;

  constructor() {
    bus.on("chat", (event) => this.onChat(event));
  }

  private onChat(event: ChatEvent): void {
    const command = parseCommand(event.text);
    if (!command) return;
    const now = Date.now();
    const userKey = `${event.chatterUserId}:${command.name}`;
    if (now - (this.usedAt.get(userKey) ?? 0) < USER_COOLDOWN_MS ||
        now - this.acceptedAt < GLOBAL_COOLDOWN_MS) return;
    this.usedAt.set(userKey, now);
    this.acceptedAt = now;
    if (this.usedAt.size > 2_000) {
      for (const [key, time] of this.usedAt) {
        if (now - time >= USER_COOLDOWN_MS) this.usedAt.delete(key);
      }
    }

    const answer = this.answer(command).catch(() => {
      console.error(`Twitch ${command.name} command failed`);
      return "Sorry, I couldn't answer that right now.";
    });
    this.enqueue(answer);
  }

  private async answer(command: Command): Promise<string> {
    if (command.name === "ping") return "pong";
    if (command.name === "catchup") return this.catchup();

    const summary = await getSummary();
    await mergeJokes(summary.jokes);
    if (!command.term) {
      const terms = (await getLore()).slice(0, 5).map((entry) => entry.term);
      for (const joke of summary.jokes) {
        if (terms.length >= 5) break;
        if (!terms.some((term) => loreKey(term) === loreKey(joke.term)) &&
            !(await isLoreDismissed(joke.term))) terms.push(joke.term);
      }
      return terms.length ? `Known lore: ${terms.join(", ")}. Try !lore <term>.` : "No channel lore saved yet.";
    }
    const term = plainText(command.term, 100);
    if (await isLoreDismissed(term)) return `I don't know where ${term} came from yet.`;
    const found = await findLore(term);
    if (found) {
      const clip = found.clipId && validClipId(found.clipId) ? ` https://clips.twitch.tv/${found.clipId}` : "";
      return `${plainText(found.explanation, 499 - clip.length)}${clip}`;
    }
    const currentJoke = findSummaryJoke(term, summary.jokes);
    if (currentJoke) {
      const clip = currentJoke.clipId && validClipId(currentJoke.clipId)
        ? ` https://clips.twitch.tv/${currentJoke.clipId}` : "";
      return `${plainText(currentJoke.explanation, 499 - clip.length)}${clip}`;
    }
    const explanation = await askUnknownLore(term);
    return explanation ?? `I don't know where ${term} came from yet.`;
  }

  private async catchup(): Promise<string> {
    if (this.catchupCache && Date.now() < this.catchupCache.expiresAt) {
      return this.catchupCache.answer;
    }
    if (this.catchupPending) return this.catchupPending;
    const pending = makeCatchup();
    this.catchupPending = pending;
    try {
      const answer = await pending;
      this.catchupCache = { answer, expiresAt: Date.now() + CATCHUP_CACHE_MS };
      return answer;
    } finally {
      if (this.catchupPending === pending) this.catchupPending = undefined;
    }
  }

  private enqueue(answer: Promise<string>): void {
    const next = this.sendQueue.catch(() => undefined).then(async () => {
      const message = plainText(await answer, 500).replace(/^(?:!\s*)+/, "").trim();
      if (!message) return;
      const wait = this.sentAt + GLOBAL_COOLDOWN_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      await sendChat(message);
      this.sentAt = Date.now();
    });
    this.sendQueue = next;
    void next.catch(() => console.error("Twitch command reply failed"));
  }
}

type CommandsGlobal = typeof globalThis & { __previouslyOnCommands?: ChatCommands };
const commandsGlobal = globalThis as CommandsGlobal;

export function startChatCommands(): void {
  commandsGlobal.__previouslyOnCommands ??= new ChatCommands();
}
