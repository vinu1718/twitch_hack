"use client";

import { useState } from "react";
import type { LoreEntry } from "@/lib/lore";

type Fields = {
  term: string;
  explanation: string;
  firstSeen: string;
  clipId: string;
};

export function LoreEditor({
  entries,
  onChange,
}: {
  entries: LoreEntry[];
  onChange: (entries: LoreEntry[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({
    term: "",
    explanation: "",
    firstSeen: "",
    clipId: "",
  });
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
        headers:
          method === "PATCH"
            ? { "Content-Type": "application/json" }
            : undefined,
        body: method === "PATCH" ? JSON.stringify(fields) : undefined,
      });
      const result = (await response.json()) as {
        entries?: LoreEntry[];
        error?: string;
      };
      if (!response.ok || !result.entries)
        throw new Error(result.error || "Could not save lore");
      onChange(result.entries);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save lore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lore-editor">
      <div className="lore-intro">
        <h2>Channel lore.</h2>
        <p className="muted">
          The bits that stick. Correct an origin or retire a joke.
        </p>
      </div>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      {entries.length ? (
        <ul className="lore-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              {editing === entry.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate(entry.id, "PATCH");
                  }}
                  className="lore-form"
                >
                  <label>
                    Term
                    <input
                      value={fields.term}
                      onChange={(event) =>
                        setFields({ ...fields, term: event.target.value })
                      }
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Explanation
                    <textarea
                      value={fields.explanation}
                      onChange={(event) =>
                        setFields({
                          ...fields,
                          explanation: event.target.value,
                        })
                      }
                      required
                      maxLength={1000}
                      rows={3}
                    />
                  </label>
                  <label>
                    First seen (ISO date/time)
                    <input
                      value={fields.firstSeen}
                      onChange={(event) =>
                        setFields({ ...fields, firstSeen: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    Twitch clip ID (optional)
                    <input
                      value={fields.clipId}
                      onChange={(event) =>
                        setFields({ ...fields, clipId: event.target.value })
                      }
                    />
                  </label>
                  <div className="lore-actions">
                    <button type="submit" disabled={busy} className="tactile">
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditing(null)}
                      className="button-quiet"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <h3>{entry.term}</h3>
                    <p>{entry.explanation}</p>
                    {entry.clipId && (
                      <span className="tiny-label muted">
                        Clip: {entry.clipId}
                      </span>
                    )}
                  </div>
                  <div className="lore-actions">
                    <button
                      type="button"
                      onClick={() => begin(entry)}
                      disabled={busy}
                      className="button-quiet"
                      aria-label={"Edit " + entry.term}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm("Delete lore for " + entry.term + "?")
                        )
                          void mutate(entry.id, "DELETE");
                      }}
                      className="button-quiet delete-button"
                      aria-label={"Delete " + entry.term}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <span className="empty-mark">↺</span>
          <p>No inside jokes saved yet.</p>
          <span>
            Recurring bits from your summaries will live here, across streams.
          </span>
        </div>
      )}
    </section>
  );
}
