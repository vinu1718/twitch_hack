"use client";
import { useState } from "react";
import type { BriefingEvent, RecapStatus } from "@/lib/recap-types";
export function RaidControls({
  status,
  disabled = false,
}: {
  briefing: BriefingEvent | null;
  status: RecapStatus | null;
  disabled?: boolean;
}) {
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function simulate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/raid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim() }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Simulation failed");
      setMessage("Raid queued · 42 simulated viewers. Watch the overlay.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel raid-test">
      <div className="panel-heading">
        <h2>Rehearse the entrance.</h2>
        <span aria-hidden="true">↙</span>
      </div>
      <p className="muted">Run the real raid flow with a channel you know.</p>
      <form onSubmit={simulate}>
        <label htmlFor="raid-login" className="field-label">
          Twitch channel login
        </label>
        <div className="raid-input">
          <span aria-hidden="true">@</span>
          <input
            id="raid-login"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            required
            pattern="[A-Za-z0-9_]{1,25}"
            placeholder="channel_name"
            disabled={disabled || busy}
          />
        </div>
        <button disabled={busy || disabled} className="button-quiet">
          {busy ? "Sending raid…" : "Simulate raid"}
          <span aria-hidden="true">↗</span>
        </button>
      </form>
      {message && (
        <p role="status" className={`feedback ${failed ? "error" : ""}`}>
          {message}
        </p>
      )}
      <p className="fine-print">
        {status?.state === "ready"
          ? "Standby narration is ready."
          : "No narration yet? Text cards still tell the story."}{" "}
        This sends a welcome to your channel chat. Voice is AI-generated.
      </p>
    </section>
  );
}
