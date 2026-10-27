import { bus } from "@/lib/bus";
import type { StreamSummary } from "@/lib/memory";
import { helix, readAuth } from "./auth";

const COOLDOWN = 90_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (moment: StreamSummary["moments"][number]) => `${moment.t}\0${moment.title}`;

class ClipCapture {
  private lastAttempt = 0;
  private messages: number[] = [];
  private spike?: { t: number; id: string };

  constructor() {
    bus.on("chat", (event) => {
      if (event.chatterUserId === event.broadcasterUserId || event.text.trimStart().startsWith("!")) return;
      const now = Date.now();
      this.messages = this.messages.filter((t) => now - t < 300_000);
      this.messages.push(now);
      const count = this.messages.filter((t) => now - t < 20_000).length;
      // Compare counts over equal 20 second windows, using the full five minute baseline.
      if (count >= 10 && count > 3 * this.messages.length / 15) {
        void this.create().then((id) => { if (id) this.spike = { t: now, id }; });
      }
    });
  }

  async create(): Promise<string | undefined> {
    const now = Date.now();
    if (now - this.lastAttempt < COOLDOWN) return;
    this.lastAttempt = now; // Reserve before any await: spikes and summary runs share this gate.
    try {
      const auth = await readAuth();
      if (!auth) return;
      const response = await helix(`clips?broadcaster_id=${encodeURIComponent(auth.user_id)}`, {
        method: "POST", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return; // Offline, disabled clips and missing permissions are nonfatal.
      const result = await response.json() as { data?: Array<{ id?: string }> };
      const id = result.data?.[0]?.id;
      if (!id || !/^[\w-]+$/.test(id)) return;
      for (let attempt = 0; attempt < 5; attempt++) {
        await wait(2_000);
        const poll = await helix(`clips?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5_000) });
        if (!poll.ok) return;
        const body = await poll.json() as { data?: Array<{ id: string }> };
        if (body.data?.some((clip) => clip.id === id)) return id;
      }
    } catch { /* Clip creation must never interrupt memory or recap generation. */ }
  }

  async attach(previous: StreamSummary, next: StreamSummary): Promise<void> {
    const old = new Map(previous.moments.map((moment) => [key(moment), moment]));
    for (const moment of next.moments) {
      delete moment.clipId; // Never trust a generated clip ID.
      const saved = old.get(key(moment))?.clipId;
      if (saved) moment.clipId = saved;
    }
    const added = next.moments.filter((moment) => !old.has(key(moment)))
      .sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
    if (this.spike) {
      const spike = this.spike;
      const matched = added.find((moment) => Math.abs(Date.parse(moment.t) - spike.t) < COOLDOWN);
      if (matched) { matched.clipId = spike.id; this.spike = undefined; }
    }
    const latest = added.find((moment) => !moment.clipId);
    if (latest) {
      const id = await this.create();
      if (id) latest.clipId = id;
    }
  }
}

type ClipGlobal = typeof globalThis & { __previouslyOnClips?: ClipCapture };
function capture(): ClipCapture {
  const global = globalThis as ClipGlobal;
  return (global.__previouslyOnClips ??= new ClipCapture());
}
export function startClips(): void { capture(); }
export function createClip(): Promise<string | undefined> { return capture().create(); }
export function attachMomentClips(previous: StreamSummary, next: StreamSummary): Promise<void> {
  return capture().attach(previous, next);
}
