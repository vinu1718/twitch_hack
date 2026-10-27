"use client";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useState } from "react";
import type { StreamSummary } from "@/lib/memory";
import type { LoreEntry } from "@/lib/lore";
import type { BriefingEvent, RecapStatus } from "@/lib/recap-types";
import AnimatedContent from "@/components/AnimatedContent";
import { MicRecorder } from "./mic-recorder";
import { LoreEditor } from "./lore-editor";
import { ClientTime } from "./client-time";
import { RaidControls } from "./raid-controls";
import { HealthBox } from "./health-box";
import { useHealth } from "./use-health";

export function DashboardLive({
  initialSummary,
  initialLore,
  login,
}: {
  initialSummary: StreamSummary;
  initialLore: LoreEntry[];
  login?: string;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [lore, setLore] = useState(initialLore);
  const [summarizing, setSummarizing] = useState(false);
  const [message, setMessage] = useState("");
  const [summaryError, setSummaryError] = useState(false);
  const [briefing, setBriefing] = useState<BriefingEvent | null>(null);
  const [recapStatus, setRecapStatus] = useState<RecapStatus | null>(null);
  const [micActive, setMicActive] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"memory" | "lore">("memory");
  const { health, offline } = useHealth();
  const recording = micActive ?? health?.micRecording ?? false;
  useEffect(() => {
    const source = new EventSource("/api/stream");
    const onSummary = (event: MessageEvent) => {
      try {
        setSummary(JSON.parse(event.data) as StreamSummary);
      } catch {}
    };
    const onLore = (event: MessageEvent) => {
      try {
        setLore(JSON.parse(event.data) as LoreEntry[]);
      } catch {}
    };
    const onBriefing = (event: MessageEvent) => {
      try {
        setBriefing(JSON.parse(event.data) as BriefingEvent);
      } catch {}
    };
    const onStatus = (event: MessageEvent) => {
      try {
        setRecapStatus(JSON.parse(event.data) as RecapStatus);
      } catch {}
    };
    source.addEventListener("summary", onSummary);
    source.addEventListener("lore", onLore);
    source.addEventListener("briefing", onBriefing);
    source.addEventListener("recap-status", onStatus);
    return () => source.close();
  }, []);
  async function summarize() {
    setSummarizing(true);
    setMessage("");
    setSummaryError(false);
    try {
      const response = await fetch("/api/summarize", { method: "POST" });
      if (!response.ok)
        throw new Error(`Summarize failed (HTTP ${response.status})`);
      const result = (await response.json()) as {
        summary: StreamSummary;
        updated: boolean;
      };
      setSummary(result.summary);
      setMessage(
        result.updated
          ? "Memory updated. Preparing the next recap."
          : "No new activity yet. Record audio or let chat tell the story.",
      );
    } catch {
      setSummaryError(true);
      setMessage(
        "Could not update memory. Your previous summary is safe. Try again.",
      );
    } finally {
      setSummarizing(false);
    }
  }
  const connected = Boolean(login && health?.eventSub.connected && !offline);
  const ready = recapStatus?.state === "ready";
  return (
    <main className="dashboard-shell" id="dashboard-main">
      <header className="dashboard-nav">
        <Link prefetch={false} href="/" className="brand">
          <span className="brand-mark">»</span> Previously On
        </Link>
        <span className="eyebrow muted">CONTROL ROOM</span>
        <div className="nav-actions">
          <ThemeToggle />
          <div className="channel-chip">
            <span className="status-dot" />
            {login ? `@${login}` : "No channel connected"}
          </div>
        </div>
      </header>
      <div className="dashboard-headline">
        <div>
          <p className="eyebrow muted">YOUR STREAM. ALL CAUGHT UP.</p>
          <h1>Keep the story going.</h1>
        </div>
        <a
          className="button-quiet"
          href="/overlay"
          target="_blank"
          rel="noreferrer"
        >
          Open OBS overlay <span aria-hidden="true">↗</span>
        </a>
      </div>
      <section className="status-rail" aria-label="Stream status">
        <AnimatedContent
          className={`status-card ${connected ? "is-good" : login ? "is-warn" : "is-off"}`}
        >
          <span className="eyebrow">
            <span className="status-dot" /> TWITCH CONNECTION
          </span>
          <strong>
            {connected
              ? "Connected"
              : login
                ? health
                  ? "Reconnecting"
                  : "Checking…"
                : "Not connected"}
          </strong>
          <span>
            {connected ? (
              `Chat + raids for @${login}`
            ) : login ? (
              "Waiting for EventSub"
            ) : (
              <a href="/api/auth/login">Connect your Twitch account ↗</a>
            )}
          </span>
        </AnimatedContent>
        <AnimatedContent
          delay={50}
          className={`status-card ${recording ? "is-recording" : "is-off"}`}
        >
          <span className="eyebrow">
            <span className="status-dot" /> MICROPHONE
          </span>
          <strong>{recording ? "Recording" : "Standing by"}</strong>
          <span>
            {recording
              ? "Your voice is becoming stream memory"
              : "Start capture when you’re ready"}
          </span>
        </AnimatedContent>
        <AnimatedContent
          delay={100}
          className={`status-card ${ready ? "is-good" : recapStatus?.state === "error" ? "is-warn" : "is-off"}`}
        >
          <span className="eyebrow">
            <span className="status-dot" /> RAID RECAP
          </span>
          <strong>
            {ready
              ? "Ready to roll"
              : recapStatus?.state === "building"
                ? "Preparing…"
                : recapStatus?.state === "error"
                  ? "Text fallback ready"
                  : "Standing by"}
          </strong>
          <span>
            {ready
              ? "Narration prepared. Let them raid."
              : recapStatus?.state === "error"
                ? "Your stream story can still play"
                : "Built from your next stream summary"}
          </span>
        </AnimatedContent>
      </section>
      {briefing && (
        <AnimatedContent
          key={`${briefing.name}-${briefing.viewers}`}
          distance={16}
          className="raid-briefing"
        >
          <span className="briefing-icon" aria-hidden="true">
            ↙
          </span>
          <div>
            <span className="eyebrow">INCOMING COMMUNITY</span>
            <h2>
              {briefing.name}{" "}
              <span>
                +{briefing.viewers} viewers ·{" "}
                {briefing.game || "Game unavailable"}
              </span>
            </h2>
            {briefing.title && (
              <p className="briefing-title">{briefing.title}</p>
            )}
            <p>{briefing.greeting}</p>
          </div>
        </AnimatedContent>
      )}
      <div className="dashboard-workspace">
        <aside
          className="dashboard-left scroll-region"
          aria-label="Stream controls"
          tabIndex={0}
        >
          {login ? (
            <MicRecorder onCaptureChange={setMicActive} />
          ) : (
            <section className="panel connect-panel">
              <span className="eyebrow accent">START HERE</span>
              <h2>
                Your channel.
                <br />
                Your story.
              </h2>
              <p>
                Connect Twitch to listen to chat and welcome your next raid.
              </p>
              <a className="tactile" href="/api/auth/login">
                Connect Twitch ↗
              </a>
            </section>
          )}
          <section className="panel setup-panel">
            <span className="eyebrow muted">BROWSER SOURCE</span>
            <h2>Ready for OBS.</h2>
            <p>
              1920 × 1080. Transparent between raids. Add the overlay above
              gameplay.
            </p>
            <a
              className="button-quiet"
              href="/overlay"
              target="_blank"
              rel="noreferrer"
            >
              Open overlay ↗
            </a>
            <p className="fine-print">
              In a browser tab, click once to enable narrator audio.
            </p>
          </section>
          <div className="control-room-footer eyebrow muted">
            LIVE STORIES.
            <br />
            SHARED MEMORIES.
          </div>
        </aside>
        <section className="panel memory-panel">
          <div className="memory-toolbar">
            <div className="view-tabs" role="group" aria-label="Memory view">
              <button
                aria-pressed={tab === "memory"}
                onClick={() => setTab("memory")}
              >
                Stream memory
              </button>
              <button
                aria-pressed={tab === "lore"}
                onClick={() => setTab("lore")}
              >
                Saved lore <span>{lore.length}</span>
              </button>
            </div>
            <span className="eyebrow muted">LIVE</span>
          </div>
          <div
            className="memory-scroll scroll-region"
            tabIndex={0}
            aria-label={
              tab === "memory" ? "Stream memory details" : "Lore editor"
            }
          >
            {tab === "memory" ? (
              <>
                <div className="now-block">
                  <span className="eyebrow accent">RIGHT NOW</span>
                  <p>{summary.now || "Your story starts here."}</p>
                  {!summary.now && (
                    <span className="muted">
                      Start the mic or wait for chat. The good moments will find
                      their way here.
                    </span>
                  )}
                  <button
                    className="button-quiet"
                    disabled={summarizing || !login}
                    onClick={summarize}
                  >
                    {summarizing ? "Updating memory…" : "Summarize now"}
                    <span aria-hidden="true">↻</span>
                  </button>
                  {message && (
                    <p
                      role="status"
                      className={`feedback ${summaryError ? "error" : ""}`}
                    >
                      {message}
                    </p>
                  )}
                </div>
                <div className="moments-heading">
                  <h2>Moments worth remembering</h2>
                  <span className="tiny-label muted">
                    {String(summary.moments.length).padStart(2, "0")} / 08
                  </span>
                </div>
                {summary.moments.length ? (
                  <ol className="moment-list">
                    {summary.moments.map((moment, index) => (
                      <li key={`${moment.t}-${index}`}>
                        <span className="moment-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <h3>{moment.title}</h3>
                          <p>{moment.detail}</p>
                          <ClientTime value={moment.t} />
                        </div>
                        {moment.clipId && (
                          <span className="clip-badge">CLIP ↗</span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty-state">
                    <span className="empty-mark">↗</span>
                    <p>No highlights yet.</p>
                    <span>
                      The attempts, wins, and “did that just happen?” moments
                      land here.
                    </span>
                  </div>
                )}
                <div className="jokes-block">
                  <span className="eyebrow muted">RUNNING BITS</span>
                  {summary.jokes.length ? (
                    <div className="joke-list">
                      {summary.jokes.map((joke, index) => (
                        <article key={`${joke.term}-${index}`}>
                          <h3>{joke.term}</h3>
                          <p>{joke.explanation}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      Every channel has a bit. Yours will show up here.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <LoreEditor entries={lore} onChange={setLore} />
            )}
          </div>
        </section>
        <aside
          className="dashboard-sidebar scroll-region"
          aria-label="Health and raid test"
          tabIndex={0}
        >
          <HealthBox health={health} offline={offline} />
          <RaidControls
            briefing={null}
            status={recapStatus}
            disabled={!login}
          />
        </aside>
      </div>
    </main>
  );
}
