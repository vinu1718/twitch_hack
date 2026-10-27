import type { StreamHealth } from "@/lib/health";

export function elapsed(
  value: number | null,
  now: number,
  seconds = true,
): string {
  if (value === null) return "unknown";
  const age = Math.max(0, Math.floor((now - value) / 1000));
  if (seconds && age < 60) return `${age}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h ${Math.floor((age % 3600) / 60)}m`;
}

export function connectionIssue(
  health: StreamHealth | null,
  offline: boolean,
): string {
  if (offline) return "Health check unavailable — retrying";
  if (!health) return "";
  if (!health.eventSub.connected) return "EventSub disconnected — reconnecting";
  const missing = ["channel.chat.message", "channel.raid"].filter(
    (type) => !health.eventSub.subscriptions.includes(type),
  );
  return missing.length
    ? `Missing ${missing.map((type) => (type === "channel.raid" ? "raid" : "chat")).join(" + ")} subscription${missing.length > 1 ? "s" : ""}`
    : "";
}
