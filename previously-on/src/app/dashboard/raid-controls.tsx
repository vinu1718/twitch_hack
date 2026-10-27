"use client";
import { useState } from "react";
import type { BriefingEvent, RecapStatus } from "@/lib/recap-types";

export function RaidControls({ briefing, status }: { briefing: BriefingEvent | null; status: RecapStatus | null }) {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function simulate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/raid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: login.trim() }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Simulation failed");
      setMessage("Raid sent with 42 simulated viewers. Watch the overlay.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Simulation failed"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-violet-500/50 bg-slate-900 p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Raid recap</h2>
      <a href="/overlay" target="_blank" rel="noreferrer" className="text-sm text-violet-300 underline">Open OBS overlay ↗</a>
    </div>
    <p role="status" className={`text-sm ${status?.state === "ready" ? "text-emerald-300" : "text-slate-300"}`}>{status?.message || "Waiting for standby recap status…"}</p>
    <form onSubmit={simulate} className="flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-48 text-sm text-slate-300">Real Twitch channel login
        <input value={login} onChange={(event) => setLogin(event.target.value)} required pattern="[A-Za-z0-9_]{1,25}" placeholder="twitch" className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white" />
      </label>
      <button disabled={busy} className="rounded-lg bg-violet-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{busy ? "Sending…" : "Simulate raid"}</button>
    </form>
    {message && <p role="status" className="text-sm text-slate-300">{message}</p>}
    <p className="text-xs text-slate-400">OBS browser sources autoplay audio. In a normal browser tab, click the overlay page once to enable sound. Narration uses an AI-generated voice.</p>
    {briefing && <aside className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Incoming community</p>
      <h3 className="mt-2 text-xl font-bold">{briefing.name} · {briefing.viewers} viewers</h3>
      <p className="mt-1 text-sm text-slate-300">{briefing.game || "Game unavailable"}{briefing.title && ` — ${briefing.title}`}</p>
      <p className="mt-3 text-amber-100">{briefing.greeting}</p>
    </aside>}
  </section>;
}
