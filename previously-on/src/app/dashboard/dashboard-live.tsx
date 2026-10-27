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
import { elapsed, connectionIssue } from "./status-text";

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
  const issue = login ? connectionIssue(health, offline) : "";
  const connected = Boolean(login && health && !issue);
  const now = health?.serverTime ?? 0;
  const ready = recapStatus?.state === "ready";
  return (
    <main className="dashboard-shell" id="dashboard-main">
      <header className="dashboard-nav">
        <Link prefetch={false} href="/" className="brand">
          <span className="brand-mark">»</span> Previously On
        </Link>
        <div className="nav-actions">
          <ThemeToggle iconOnly />
          <div className="channel-chip">
            <span className="status-dot" />
            {login ? `@${login}` : "No channel connected"}
          </div>
        </div>
        <a
          className="button-quiet overlay-link"
          href="/overlay"
          target="_blank"
          rel="noreferrer"
          title="OBS autoplays audio. In a normal browser tab, click once to enable narrator audio."
        >
          Open OBS overlay <span aria-hidden="true">↗</span>
        </a>
      </header>
      <section className="status-rail" aria-label="Stream status">
        <AnimatedContent
          className={`status-card ${issue ? "is-error" : connected ? "is-good" : "is-off"}`}
        >
          <span className="eyebrow">
            <span className="status-dot" /> TWITCH CONNECTION
          </span>
          <strong>
            {connected
              ? "Connected"
              : !login
                ? "Not connected"
                : issue
                  ? "Needs attention"
                  : "Checking…"}
          </strong>
          <span>
            {!login ? (
              <a href="/api/auth/login">Connect Twitch ↗</a>
            ) : (
              issue ||
              (health
                ? `Connected · session ${elapsed(health.eventSub.sessionStartedAt, now, false)}`
                : "Checking connection…")
            )}
          </span>
        </AnimatedContent>
        <AnimatedContent
          delay={50}
          className={`status-card ${recording ? "is-good" : "is-off"}`}
        >
          <span className="eyebrow">
            <span className="status-dot" /> MICROPHONE
          </span>
          <strong>{recording ? "Recording" : "Standing by"}</strong>
          <span>
            {recording
              ? health?.lastTranscriptAt
                ? `Last chunk ${elapsed(health.lastTranscriptAt, now)} ago`
                : "Waiting for first chunk"
              : "Mic is off"}
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
              ? "Ready for the next raid"
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
        </aside>
        <section
          className="panel current-memory scroll-region"
          aria-label="Current stream memory"
          tabIndex={0}
        >
          <div className="now-block">
            <h1 className="eyebrow accent">RIGHT NOW</h1>
            <p>{summary.now || "Your story starts here."}</p>
            {!summary.now && (
              <span className="muted">Start the mic or wait for chat.</span>
            )}
            <div className="summary-actions">
              <button
                className="button-quiet"
                disabled={summarizing || !login}
                onClick={summarize}
              >
                {summarizing || health?.summaryState === "running"
                  ? "Updating memory…"
                  : "Summarize now"}
                <span aria-hidden="true">↻</span>
              </button>
              <span className="muted">
                {health?.lastSummaryAt
                  ? `${health.summaryState === "error" ? "Last attempt" : health.summaryState === "running" ? "Started" : "Updated"} ${elapsed(health.lastSummaryAt, now)} ago`
                  : "No summary run yet"}
              </span>
            </div>
            {health?.summaryState === "error" && (
              <p role="status" className="feedback error">
                Last summary failed. Your previous memory is still here. Try
                again.
              </p>
            )}
            {message && (
              <p
                role="status"
                className={`feedback ${summaryError ? "error" : ""}`}
              >
                {message}
              </p>
            )}
          </div>
        </section>
      </div>
      <footer className="dashboard-tools">
        <details className="tool-disclosure">
          <summary>
            Memory &amp; lore{" "}
            <span className="muted">
              {summary.moments.length}{" "}
              {summary.moments.length === 1 ? "moment" : "moments"}
            </span>
          </summary>
          <div
            className="tool-content scroll-region"
            tabIndex={0}
            aria-label="Memory and lore details"
          >
            <div className="view-tabs" role="group" aria-label="Memory view">
              <button
                aria-pressed={tab === "memory"}
                onClick={() => setTab("memory")}
              >
                Moments &amp; running bits
              </button>
              <button
                aria-pressed={tab === "lore"}
                onClick={() => setTab("lore")}
              >
                Saved lore <span>{lore.length}</span>
              </button>
            </div>
            {tab === "memory" ? (
              <>
                {" "}
                <div className="moments-heading">
                  <h2>Moments worth remembering</h2>
                  <span className="tiny-label muted">
                    {summary.moments.length}{" "}
                    {summary.moments.length === 1 ? "moment" : "moments"}
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
        </details>
        <details className="tool-disclosure">
          <summary>Test</summary>
          <div className="tool-content">
            <RaidControls disabled={!login} />
          </div>
        </details>
        <details className="tool-disclosure">
          <summary>Details</summary>
          <div
            className="tool-content scroll-region"
            tabIndex={0}
            aria-label="Debugging details"
          >
            <HealthBox health={health} offline={offline} />
          </div>
        </details>
      </footer>
    </main>
  );
}
