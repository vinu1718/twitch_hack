import type { StreamSummary } from "@/lib/memory";

export type RecapSegment = { text: string; momentIndex: number };
export type PreparedRecap = {
  audioUrl: string;
  script: string;
  segments: RecapSegment[];
  clipIds: Array<string | null>;
  channel: string;
  moments: StreamSummary["moments"];
};
export type RecapEvent = PreparedRecap & {
  raidId: string;
  raider: { name: string; viewers: number };
};
export type WelcomeEvent = {
  raidId: string;
  audioUrl: string;
  raider: { name: string; viewers: number; game: string };
};
export type BriefingEvent = {
  name: string;
  viewers: number;
  game: string;
  title: string;
  greeting: string;
};
export type RecapStatus = { state: "building" | "ready" | "error"; message: string };
