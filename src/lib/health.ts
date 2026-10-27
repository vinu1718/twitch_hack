export type StreamHealth = {
  eventSub: { connected: boolean; sessionStartedAt: number | null; subscriptions: string[] };
  lastChatAt: number | null;
  lastTranscriptAt: number | null;
  lastSummaryAt: number | null;
  summaryState: "idle" | "running" | "ok" | "error";
  micRecording: boolean;
  tokenExpiresAt: number | null;
  serverTime: number;
};
type HealthState = Omit<StreamHealth, "tokenExpiresAt" | "serverTime" | "micRecording"> & { microphones: Map<string, number> };
type HealthGlobal = typeof globalThis & { __previouslyOnHealth?: HealthState };
const state = ((globalThis as HealthGlobal).__previouslyOnHealth ??= {
  eventSub: { connected: false, sessionStartedAt: null, subscriptions: [] },
  lastChatAt: null, lastTranscriptAt: null, lastSummaryAt: null, summaryState: "idle", microphones: new Map(),
});
export function eventSubHealth(connected: boolean, started: number | null = null, subscriptions: string[] = []): void {
  state.eventSub = { connected, sessionStartedAt: started, subscriptions };
}
export function noteChat(): void { state.lastChatAt = Date.now(); }
export function noteTranscript(): void { state.lastTranscriptAt = Date.now(); }
export function noteSummary(status: "running" | "ok" | "error", timestamp = Date.now()): void {
  if (status === "running" || status === "ok") state.lastSummaryAt = timestamp;
  state.summaryState = status;
}
export function microphoneLease(id: string, active: boolean): void {
  if (active) state.microphones.set(id, Date.now() + 75_000);
  else state.microphones.delete(id);
}
export function isMicRecording(): boolean {
  for (const [id, expiry] of state.microphones) if (expiry <= Date.now()) state.microphones.delete(id);
  return state.microphones.size > 0;
}
export function healthSnapshot(tokenExpiresAt: number | null): StreamHealth {
  return { eventSub: { ...state.eventSub, subscriptions: [...state.eventSub.subscriptions] },
    lastChatAt: state.lastChatAt, lastTranscriptAt: state.lastTranscriptAt,
    lastSummaryAt: state.lastSummaryAt, summaryState: state.summaryState,
    micRecording: isMicRecording(), tokenExpiresAt, serverTime: Date.now() };
}
