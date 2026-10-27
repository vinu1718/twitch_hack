"use client";

import { useEffect, useRef, useState } from "react";
import type { RecapEvent, WelcomeEvent } from "@/lib/recap-types";

type Phase = "title" | "story" | "welcome" | "out";
const silentWav = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==";

export function OverlayPlayer() {
  const [queue, setQueue] = useState<RecapEvent[]>([]);
  const recap = queue[0] ?? null;
  const [phase, setPhase] = useState<Phase>("title");
  const [progress, setProgress] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [parent, setParent] = useState("localhost");
  const [scale, setScale] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  const welcomes = useRef(new Map<string, WelcomeEvent>());
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    resize();
    window.addEventListener("resize", resize);
    const source = new EventSource("/api/stream");
    const onRecap = (event: MessageEvent) => {
      try {
        const next = JSON.parse(event.data) as RecapEvent;
        if (!next.raidId || !Array.isArray(next.segments) || !next.segments.length) return;
        if (seen.current.has(next.raidId)) return;
        seen.current.add(next.raidId);
        if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!);
        setQueue((pending) => [...pending, next]);
      } catch { /* Ignore malformed events. */ }
    };
    const onWelcome = (event: MessageEvent) => {
      try {
        const welcome = JSON.parse(event.data) as WelcomeEvent;
        if (welcome.raidId && welcome.audioUrl) {
          welcomes.current.set(welcome.raidId, welcome);
          if (welcomes.current.size > 10) welcomes.current.delete(welcomes.current.keys().next().value!);
        }
      } catch { /* Ignore malformed events. */ }
    };
    source.addEventListener("recap", onRecap);
    source.addEventListener("recap-welcome", onWelcome);
    return () => { window.removeEventListener("resize", resize); source.close(); };
  }, []);

  useEffect(() => {
    if (!recap || !audio.current) return;
    const controller = new AbortController();
    const element = audio.current;
    const welcomeEvents = welcomes.current;
    const signal = controller.signal;
    const delay = (ms: number) => new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      if (signal.aborted) done();
    });
    async function play(url: string, track = false): Promise<void> {
      if (signal.aborted) return;
      if (!url) {
        for (let step = 0; step < 150 && !signal.aborted; step++) {
          if (track) setProgress(step / 150);
          await delay(100);
        }
        return;
      }
      let failed = false;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timeout);
          element.removeEventListener("ended", done);
          element.removeEventListener("error", error);
          element.removeEventListener("timeupdate", update);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const error = () => { failed = true; done(); };
        const update = () => { if (track && Number.isFinite(element.duration) && element.duration > 0) setProgress(element.currentTime / element.duration); };
        const timeout = setTimeout(done, 60_000);
        element.addEventListener("ended", done, { once: true });
        element.addEventListener("error", error, { once: true });
        element.addEventListener("timeupdate", update);
        signal.addEventListener("abort", done, { once: true });
        element.src = url;
        element.play().then(() => { if (!signal.aborted) setBlocked(false); }).catch((cause: unknown) => {
          if (signal.aborted) return;
          if (cause instanceof DOMException && cause.name === "NotAllowedError") setBlocked(true);
          else error();
        });
      });
      if (failed && track && !signal.aborted) await play("", true);
      if (track && !signal.aborted) setProgress(1);
    }
    async function run() {
      setParent(window.location.hostname);
      setBlocked(false); setProgress(0); setPhase("title");
      // Start buffering immediately while the title card lands.
      element.src = recap!.audioUrl || silentWav;
      element.load();
      await delay(1_500);
      if (signal.aborted) return;
      setPhase("story");
      await play(recap!.audioUrl, true);
      if (signal.aborted) return;
      element.pause();
      setBlocked(false); setPhase("welcome");
      const deadline = Date.now() + 3_000;
      while (!welcomes.current.has(recap!.raidId) && Date.now() < deadline && !signal.aborted) await delay(100);
      const welcome = welcomes.current.get(recap!.raidId);
      if (!signal.aborted && welcome) await play(welcome.audioUrl);
      if (signal.aborted) return;
      await delay(1_500);
      if (signal.aborted) return;
      setPhase("out");
      await delay(700);
      if (!signal.aborted) setQueue((pending) => pending.filter((item) => item.raidId !== recap!.raidId));
    }
    void run();
    return () => {
      controller.abort(); element.pause(); element.removeAttribute("src"); element.load();
      welcomeEvents.delete(recap.raidId);
      void fetch("/api/recaps/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raidId: recap.raidId }), keepalive: true }).catch(() => undefined);
    };
  }, [recap]);

  function unlock() {
    const element = audio.current;
    if (!element) return;
    if (!recap) element.src = silentWav;
    void element.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }

  const total = recap?.segments.reduce((sum, segment) => sum + segment.text.length, 0) || 1;
  let consumed = 0;
  const index = recap?.segments.findIndex((segment) => {
    consumed += segment.text.length;
    return progress < consumed / total;
  }) ?? 0;
  const segmentIndex = index < 0 ? (recap?.segments.length ?? 1) - 1 : index;
  const segment = recap?.segments[segmentIndex];
  const moment = segment && segment.momentIndex >= 0 ? recap?.moments[segment.momentIndex] : undefined;
  const clip = segment && segment.momentIndex >= 0 ? recap?.clipIds[segment.momentIndex] : null;

  return <main className="broadcast-root" onPointerDown={unlock}>
    <audio ref={audio} preload="auto" />
    {recap && <div className="broadcast-viewport" style={{ transform: `scale(${scale})` }}><div className={`broadcast-stage phase-${phase}`} key={recap.raidId}>
      <div className="broadcast-wash" />
      <div className="broadcast-bug"><span /> PREVIOUSLY ON <b>•</b> {recap.channel}</div>
      {phase === "title" && <section className="broadcast-title">
        <span className="broadcast-eyebrow">THE STORY SO FAR</span>
        <h1>PREVIOUSLY<br /><em>ON</em></h1>
        <div className="broadcast-channel">{recap.channel}</div>
        <span className="broadcast-rule" />
      </section>}
      {phase === "story" && <section className="broadcast-story">
        <div className="broadcast-frame">
          <div className="broadcast-frame-label">EARLIER THIS STREAM <span>{String(segmentIndex + 1).padStart(2, "0")} / {String(recap.segments.length).padStart(2, "0")}</span></div>
          {clip ? <iframe key={clip} title="Earlier stream clip" src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`} allow="autoplay; fullscreen" />
            : <div key={segmentIndex} className="broadcast-moment">
              <div className="broadcast-moment-number">{String(segmentIndex + 1).padStart(2, "0")}</div>
              <p className="broadcast-eyebrow">{moment ? "A MOMENT TO REMEMBER" : "YOU'RE ALL CAUGHT UP"}</p>
              <h2>{moment?.title || recap.channel}</h2>
              <p>{moment?.detail || recap.script}</p>
            </div>}
          <div className="broadcast-progress"><span style={{ width: `${progress * 100}%` }} /></div>
        </div>
        <div key={segmentIndex} className="broadcast-subtitle">{segment?.text}</div>
      </section>}
      {(phase === "welcome" || phase === "out") && <section className="broadcast-welcome">
        <p className="broadcast-eyebrow">A NEW COMMUNITY ENTERS THE STORY</p>
        <h2>WELCOME,<br /><em>{recap.raider.name}</em><br />RAIDERS.</h2>
        <div className="broadcast-viewers"><strong>{recap.raider.viewers}</strong> NEW FACES. NEXT CHAPTER.</div>
        <p className="broadcast-catchup">Missed the plot? <b>!catchup</b> in chat.</p>
      </section>}
      <div className="broadcast-footer">LIVE STORIES. SHARED MEMORIES.<span>AI NARRATION / PREVIOUSLY ON</span></div>
      {blocked && <button className="broadcast-unlock" onClick={unlock}>Click to enable narrator audio</button>}
    </div></div>}
  </main>;
}
