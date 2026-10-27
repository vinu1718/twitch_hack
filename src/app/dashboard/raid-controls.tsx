"use client";
import { useState } from "react";
export function RaidControls({
  disabled = false,
  onSimulated,
}: {
  disabled?: boolean;
  onSimulated?: () => void;
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
      onSimulated?.();
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
        <h2>Test a raid</h2>
        <span aria-hidden="true">↙</span>
      </div>
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
        <div className="test-actions">
          <button disabled={busy || disabled} className="button-quiet">
            {busy ? "Sending raid…" : "Simulate raid"}
            <span aria-hidden="true">↗</span>
          </button>
          <a
            className="button-quiet"
            href="/overlay?preview"
            target="_blank"
            rel="noreferrer"
          >
            Preview overlay ↗
          </a>
        </div>
      </form>
      {message && (
        <p role="status" className={`feedback ${failed ? "error" : ""}`}>
          {message}
        </p>
      )}
      <p className="fine-print">
        Simulate raid sends a welcome to chat. Preview overlay only plays in
        your browser. Voice is AI-generated.
      </p>
    </section>
  );
}
