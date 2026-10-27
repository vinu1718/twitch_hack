import type { StreamSummary } from "@/lib/memory";
import type { PreparedRecap } from "@/lib/recap-types";

export function textRecap(summary: StreamSummary, channel: string): PreparedRecap {
  const moments = summary.moments.slice(-3);
  const segments = [{ text: `Previously on ${channel}...`, momentIndex: -1 },
    ...moments.map((moment, momentIndex) => ({ text: `${moment.title}. ${moment.detail}`, momentIndex }))];
  if (!moments.length) segments.push({ text: summary.now || "The story is just getting started. Welcome in!", momentIndex: -1 });
  return { audioUrl: "", script: segments.map((line) => line.text).join(" "), segments,
    channel, moments, clipIds: moments.map(() => null) };
}
