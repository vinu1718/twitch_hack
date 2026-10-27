"use client";

import { useState } from "react";
import type { LoreEntry } from "@/lib/lore";

type Fields = { term: string; explanation: string; firstSeen: string; clipId: string };

export function LoreEditor({ entries, onChange }: {
  entries: LoreEntry[];
  onChange: (entries: LoreEntry[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({ term: "", explanation: "", firstSeen: "", clipId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function begin(entry: LoreEntry) {
    setEditing(entry.id);
    setFields({
      term: entry.term,
      explanation: entry.explanation,
      firstSeen: entry.firstSeen,
      clipId: entry.clipId ?? "",
    });
    setError("");
  }

  async function mutate(id: string, method: "PATCH" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/lore/${encodeURIComponent(id)}`, {
        method,
        headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PATCH" ? JSON.stringify(fields) : undefined,
      });
      const result = await response.json() as { entries?: LoreEntry[]; error?: string };
      if (!response.ok || !result.entries) throw new Error(result.error || "Could not save lore");
      onChange(result.entries);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save lore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-lg font-semibold">Saved lore</h2>
      <p className="mt-1 text-sm text-slate-400">Correct a joke&apos;s origin or remove one that is wrong.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      {entries.length ? (
        <ul className="mt-4 space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-slate-700 p-4">
              {editing === entry.id ? (
                <form onSubmit={(event) => { event.preventDefault(); void mutate(entry.id, "PATCH"); }} className="space-y-3">
                  <label className="block text-sm">
                    Term
                    <input value={fields.term} onChange={(event) => setFields({ ...fields, term: event.target.value })}
                      required maxLength={100} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" />
                  </label>
                  <label className="block text-sm">
                    Explanation
                    <textarea value={fields.explanation} onChange={(event) => setFields({ ...fields, explanation: event.target.value })}
                      required maxLength={1000} rows={3} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      First seen (ISO date/time)
                      <input value={fields.firstSeen} onChange={(event) => setFields({ ...fields, firstSeen: event.target.value })}
                        required className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" />
                    </label>
                    <label className="block text-sm">
                      Twitch clip ID (optional)
                      <input value={fields.clipId} onChange={(event) => setFields({ ...fields, clipId: event.target.value })}
                        className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy} className="rounded bg-violet-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Save</button>
                    <button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded border border-slate-600 px-3 py-2 text-sm">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-violet-200">{entry.term}</p>
                    <p className="mt-1 text-sm text-slate-300">{entry.explanation}</p>
                    {entry.clipId && <p className="mt-1 text-xs text-slate-400">Clip: {entry.clipId}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => begin(entry)} disabled={busy} className="rounded border border-slate-600 px-3 py-1 text-sm">Edit</button>
                    <button type="button" disabled={busy} onClick={() => {
                      if (window.confirm(`Delete lore for ${entry.term}?`)) void mutate(entry.id, "DELETE");
                    }} className="rounded border border-rose-500 px-3 py-1 text-sm text-rose-300">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-sm text-slate-400">No lore saved yet. New jokes from summaries will appear here.</p>}
    </section>
  );
}
