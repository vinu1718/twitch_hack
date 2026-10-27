import { randomUUID } from "node:crypto";
import { bus, type RaidEvent } from "@/lib/bus";
import { getSummary, type StreamSummary } from "@/lib/memory";
import { cleanRecapAudio, narrate } from "@/lib/recap-media";
import { recapScript } from "@/lib/recap-script";
import type { PreparedRecap, RecapStatus } from "@/lib/recap-types";
import { helix, readAuth } from "@/lib/twitch/auth";
import { sendChat } from "@/lib/twitch/chat";
import { textRecap } from "@/lib/recap-fallback";

class Recaps {
  private standby?: PreparedRecap;
  private requested?: StreamSummary;
  private fingerprint = "";
  private building?: Promise<void>;
  private active?: { id: string; urls: string[]; expires: number };
  private queue: RaidEvent[] = [];
  private contexts = new WeakMap<RaidEvent, Promise<{ game: string; title: string }>>();
  private playbackTimer?: ReturnType<typeof setTimeout>;
  private lastSummary: StreamSummary = { now: "", moments: [], jokes: [] };
  private channel = "this channel";
  private generating = new Set<string>();
  private cleanupQueue: Promise<void> = Promise.resolve();
  status: RecapStatus = { state: "building", message: "Waiting for stream memory" };

  static standbySnapshot(service?: Recaps): PreparedRecap | null {
    return service?.standby ? structuredClone(service.standby) : null;
  }

  constructor() {
    bus.on("summary", (summary) => { this.lastSummary = structuredClone(summary); void this.prepare(summary); });
    bus.on("raid", (raid) => {
      // Queue playback only; arriving viewers and the streamer still get an immediate welcome/briefing.
      this.contexts.set(raid, this.lookupRaider(raid));
      void sendChat(`Welcome raiders from ${raid.fromBroadcasterLogin}! Type !catchup anytime to see what you missed.`)
        .catch(() => console.error("Raid welcome chat failed"));
      this.queue.push(raid);
      this.drain();
    });
    const timer = setInterval(() => { void this.cleanup(); }, 30_000);
    timer.unref();
  }

  private setStatus(status: RecapStatus) { this.status = status; bus.emit("recap-status", status); }

  async prepare(summary: StreamSummary): Promise<void> {
    this.lastSummary = structuredClone(summary);
    const fingerprint = JSON.stringify(summary);
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      this.requested = structuredClone(summary);
    }
    if (this.building) return this.building;
    if (!this.requested) return;
    const task = this.buildLoop();
    this.building = task;
    try { await task; } finally { if (this.building === task) this.building = undefined; }
  }

  private async buildLoop(): Promise<void> {
    while (this.requested) {
      const summary = this.requested;
      this.requested = undefined;
      this.setStatus({ state: "building", message: this.standby ? "Refreshing standby recap; previous recap is ready" : "Preparing narrator and standby recap…" });
      let audioUrl: string | undefined;
      try {
        const auth = await readAuth();
        if (!auth) throw new Error("Twitch is not connected");
        this.channel = auth.login;
        const script = await recapScript(auth.login, summary);
        audioUrl = await this.speech(script.script);
        this.standby = {
          ...script, audioUrl, channel: auth.login, moments: summary.moments,
          clipIds: summary.moments.map((moment) => moment.clipId ?? null),
        };
        this.generating.delete(audioUrl);
        this.setStatus({ state: "ready", message: "Standby recap ready — raids play immediately" });
      } catch {
        this.fingerprint = "";
        this.setStatus({ state: "error", message: this.standby ? "Refresh failed; previous standby is still ready" : "Recap preparation failed. Check Twitch and OpenAI, then summarize again." });
        console.error("Standby recap preparation failed");
      } finally {
        if (audioUrl) this.generating.delete(audioUrl);
        await this.cleanup();
      }
    }
  }

  private async speech(text: string, welcome = false): Promise<string> {
    const id = `${randomUUID()}.mp3`;
    const url = `/api/recaps/${id}`;
    this.generating.add(url);
    try {
      await narrate(text, welcome, id);
      return url;
    } catch (error) { this.generating.delete(url); throw error; }
  }

  private cleanup(): Promise<void> {
    const task = this.cleanupQueue.catch(() => undefined).then(async () => {
      await cleanRecapAudio(() => [
        ...(this.standby ? [this.standby.audioUrl] : []),
        ...(this.active?.urls ?? []), ...this.generating,
      ]);
    }).catch(() => console.error("Recap media cleanup failed"));
    this.cleanupQueue = task;
    return task;
  }

  finish(id: string): void {
    if (this.active?.id !== id) return;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);
    this.playbackTimer = undefined;
    this.active = undefined;
    this.drain();
    void this.cleanup();
  }

  private drain(): void {
    if (this.active) return;
    const raid = this.queue.shift();
    if (raid) this.raid(raid);
  }

  private raid(raid: RaidEvent): void {
    const id = randomUUID();
    const active = { id, urls: [] as string[], expires: Date.now() + 180_000 };
    this.active = active;
    this.playbackTimer = setTimeout(() => this.finish(id), 180_000);
    this.playbackTimer.unref();
    const raider = { name: raid.fromBroadcasterLogin, viewers: raid.viewers };

    // Never await providers, auth or disk before showing a cold raid. Memory is already hydrated at startup.
    const prepared = this.standby ?? textRecap(this.lastSummary, this.channel);
    active.urls.push(prepared.audioUrl);
    bus.emit("recap", { ...prepared, raidId: id, raider });
    if (!this.standby) void this.prepare(this.lastSummary);

    void this.welcome(raid, id).catch(() => console.error("Raid welcome narration failed"));

  }

  async hydrate(): Promise<void> {
    this.lastSummary = await getSummary();
    const auth = await readAuth();
    if (auth) this.channel = auth.login;
    if (auth && (this.lastSummary.now || this.lastSummary.moments.length)) void this.prepare(this.lastSummary);
  }

  private async lookupRaider(raid: RaidEvent): Promise<{ game: string; title: string }> {
    let game = "", title = "";
    try {
      const response = await helix(`channels?broadcaster_id=${encodeURIComponent(raid.fromBroadcasterUserId)}`, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) {
        const result = await response.json() as { data?: Array<{ game_name: string; title: string }> };
        game = result.data?.[0]?.game_name ?? "";
        title = result.data?.[0]?.title ?? "";
      }
    } catch { /* A channel lookup failure must not prevent the welcome. */ }
    const name = raid.fromBroadcasterLogin;
    bus.emit("briefing", { name, viewers: raid.viewers, game, title,
      greeting: game ? `Ask ${name}'s community how their ${game} stream went.` : `Thank ${name} for bringing their community and ask how their stream went.` });
    return { game, title };
  }

  private async welcome(raid: RaidEvent, id: string): Promise<void> {
    const { game } = await (this.contexts.get(raid) ?? this.lookupRaider(raid));
    if (this.active?.id !== id) return;
    const name = raid.fromBroadcasterLogin;
    const audioUrl = await this.speech(`And to ${name}'s community, welcome in!`, true);
    if (this.active?.id === id) {
      this.active.urls.push(audioUrl);
      bus.emit("recap-welcome", { raidId: id, audioUrl, raider: { name, viewers: raid.viewers, game } });
    }
    this.generating.delete(audioUrl);
    await this.cleanup();
  }
}

type RecapGlobal = typeof globalThis & { __previouslyOnRecaps?: Recaps };
function recaps(): Recaps {
  const global = globalThis as RecapGlobal;
  return (global.__previouslyOnRecaps ??= new Recaps());
}
export function startRecaps(): void {
  const service = recaps();
  void service.hydrate().catch(() => console.error("Recap startup failed"));
}
export function finishRecap(id: string): void { recaps().finish(id); }
export function getRecapStatus(): RecapStatus { return recaps().status; }
// Read-only: inspecting a standby must never initialize the raid service or enqueue playback.
export function getStandbyRecap(): PreparedRecap | null {
  return Recaps.standbySnapshot((globalThis as RecapGlobal).__previouslyOnRecaps);
}
export function prepareStandby(summary: StreamSummary): void { void recaps().prepare(summary); }
