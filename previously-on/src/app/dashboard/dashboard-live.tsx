"use client";

import { useEffect, useState } from "react";
import type { StreamSummary } from "@/lib/memory";
import { MicRecorder } from "./mic-recorder";

export function DashboardLive({ initialSummary }: { initialSummary: StreamSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [summarizing, setSummarizing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const source = new EventSource("/api/stream");
    const onSummary = (event: MessageEvent) => {
      try { setSummary(JSON.parse(event.data) as StreamSummary); } catch { /* ignore malformed event */ }
    };
    source.addEventListener("summary", onSummary);
    return () => {
      source.removeEventListener("summary", onSummary);
      source.close();
    };
  }, []);

  async function summarize() {
    setSummarizing(true);
    setMessage("");
    try {
      const response = await fetch("/api/summarize", { method: "POST" });
      if (!response.ok) throw new Error(`Summarize failed (HTTP ${response.status})`);
      const result = await response.json() as { summary: StreamSummary; updated: boolean };
      setSummary(result.summary);
      setMessage(result.updated ? "Summary updated" : "No new stream activity yet");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Summarize failed");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="space-y-6">
      <MicRecorder />
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Live stream memory</h2>
          <button
            type="button"
            onClick={summarize}
            disabled={summarizing}
            className="rounded-lg border border-violet-400 px-4 py-2 text-sm font-semibold text-violet-200 disabled:opacity-50"
          >
            {summarizing ? "Summarizing…" : "Summarize now"}
          </button>
        </div>
        {message && <p role="status" className="mt-2 text-sm text-slate-400">{message}</p>}
        <p className="mt-4 text-slate-200">{summary.now || "Waiting for stream audio or chat."}</p>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Moments</h2>
          {summary.moments.length ? (
            <ul className="mt-4 space-y-4">
              {summary.moments.map((moment, index) => (
                <li key={`${moment.t}-${index}`}>
                  <p className="font-medium text-violet-200">{moment.title}</p>
                  <p className="text-sm text-slate-300">{moment.detail}</p>
                  <time className="text-xs text-slate-500">{new Date(moment.t).toLocaleTimeString()}</time>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-slate-400">No moments yet.</p>}
        </section>
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Channel jokes</h2>
          {summary.jokes.length ? (
            <ul className="mt-4 space-y-4">
              {summary.jokes.map((joke, index) => (
                <li key={`${joke.term}-${index}`}>
                  <p className="font-medium text-violet-200">{joke.term}</p>
                  <p className="text-sm text-slate-300">{joke.explanation}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-slate-400">Recurring bits will appear here.</p>}
        </section>
      </div>
    </div>
  );
}
