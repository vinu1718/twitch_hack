"use client";
import type { StreamHealth } from "@/lib/health";
function ago(value: number | null, now: number): string {
  if (!value) return "Waiting for activity";
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  return seconds < 60
    ? `${seconds}s ago`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}
export function HealthBox({
  health,
  offline,
}: {
  health: StreamHealth | null;
  offline: boolean;
}) {
  const now = health?.serverTime ?? 0;
  const rows = health
    ? [
        [
          "EventSub session",
          health.eventSub.connected
            ? ago(health.eventSub.sessionStartedAt, now).replace(" ago", " old")
            : "Reconnecting",
        ],
        ["Last chat", ago(health.lastChatAt, now)],
        ["Last transcript", ago(health.lastTranscriptAt, now)],
        [
          "Last summary",
          `${ago(health.lastSummaryAt, now)} · ${health.summaryState}`,
        ],
        ["Summary cadence", health.micRecording ? "Every 60s" : "Every 120s"],
      ]
    : [];
  return (
    <section className="panel health-panel" aria-labelledby="health-heading">
      <div className="panel-heading">
        <h2 id="health-heading">System health</h2>
        <span className={`tiny-label ${offline ? "tone-error" : "muted"}`}>
          {offline ? "STALE" : "LIVE / 5s"}
        </span>
      </div>
      {offline && (
        <p role="status" className="feedback error">
          Connection lost. Checking again…
        </p>
      )}
      {!health && <p className="empty-state">Checking stream services…</p>}
      <dl className="health-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {health && (
        <p className="health-subscriptions">
          <span
            className={`status-dot ${health.eventSub.subscriptions.length === 2 ? "tone-good" : "tone-warn"}`}
          />
          {health.eventSub.subscriptions.length === 2
            ? "Chat + raid subscriptions active"
            : "Waiting for chat + raid subscriptions"}
        </p>
      )}
    </section>
  );
}
