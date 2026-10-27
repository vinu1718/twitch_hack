"use client";
import { useEffect, useState } from "react";
import type { StreamHealth } from "@/lib/health";

function ago(value: number | null, now: number): string {
  if (!value) return "Not yet";
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}
export function HealthBox() {
  const [health, setHealth] = useState<StreamHealth | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]) });
        if (!response.ok) throw new Error("Health unavailable");
        const snapshot = await response.json() as StreamHealth;
        if (!controller.signal.aborted) { setHealth(snapshot); setOffline(false); }
      } catch { if (!controller.signal.aborted) setOffline(true); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 5_000); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  const now = health?.serverTime ?? 0;
  const expiry = health?.tokenExpiresAt;
  const rows = health ? [
    ["EventSub", health.eventSub.connected ? `Connected · session ${ago(health.eventSub.sessionStartedAt, now).replace(" ago", " old")}` : "Disconnected / reconnecting"],
    ["Subscriptions", health.eventSub.subscriptions.join(", ") || "None active"],
    ["Last chat event", ago(health.lastChatAt, now)],
    ["Last transcript chunk", ago(health.lastTranscriptAt, now)],
    ["Last summary run", `${ago(health.lastSummaryAt, now)} · ${health.summaryState}`],
    ["Summary cadence", health.micRecording ? "60s · microphone recording" : "120s · microphone stopped"],
    ["Token expiry", expiry ? `${new Date(expiry).toLocaleTimeString()} · ${expiry <= now ? "expired — refreshes on next API call" : `${Math.ceil((expiry - now) / 60_000)}m remaining`}` : "Not connected"],
  ] : [];
  return <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
    <h2 className="text-lg font-semibold">Health</h2>
    <p role="status" className={`mt-1 text-xs ${offline ? "text-rose-300" : "text-slate-400"}`}>{offline ? "Health endpoint unavailable; values below may be stale" : "Updates every 5 seconds"}</p>
    {!health && <p className="mt-3 text-sm text-slate-400">Loading health…</p>}
    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm text-slate-100">{value}</dd></div>)}
    </dl>
  </section>;
}
