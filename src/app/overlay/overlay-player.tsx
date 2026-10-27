"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { RecapEvent, WelcomeEvent } from "@/lib/recap-types";
import DecryptedText from "@/components/DecryptedText";
import SplitText from "@/components/SplitText";
import { useOverlaySequence } from "./use-overlay-sequence";
import { useOverlayPreview } from "./use-overlay-preview";
const subscribeToEnvironment = () => () => {};
export function OverlayPlayer() {
  const [queue, setQueue] = useState<RecapEvent[]>([]);
  const { preview, loading, error, play, cancel } = useOverlayPreview();
  const recap = queue[0] ?? preview;
  const browserTab = useSyncExternalStore(
    subscribeToEnvironment,
    () => (window as Window & { obsstudio?: unknown }).obsstudio === undefined,
    () => false,
  );
  const [parent, setParent] = useState("localhost");
  const [scale, setScale] = useState(1);
  const welcomes = useRef(new Map<string, WelcomeEvent>());
  const seen = useRef(new Set<string>());
  const complete = useCallback(
    (id: string) => {
      if (id.startsWith("preview-")) cancel();
      else setQueue((pending) => pending.filter((item) => item.raidId !== id));
    },
    [cancel],
  );
  const { audio, stage, phase, progress, blocked, unlock } = useOverlaySequence(
    recap,
    welcomes,
    complete,
    recap !== null && recap === preview,
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("preview")) void play();
  }, [play]);
  useEffect(() => {
    const resize = () => {
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
      setParent(window.location.hostname);
    };
    resize();
    window.addEventListener("resize", resize);
    const source = new EventSource("/api/stream");
    const onRecap = (event: MessageEvent) => {
      try {
        const next = JSON.parse(event.data) as RecapEvent;
        if (
          !next.raidId ||
          !Array.isArray(next.segments) ||
          !next.segments.length ||
          seen.current.has(next.raidId)
        )
          return;
        seen.current.add(next.raidId);
        if (seen.current.size > 500)
          seen.current.delete(seen.current.values().next().value!);
        cancel(); // A real raid always takes priority over a local preview.
        setQueue((pending) => [...pending, next]);
      } catch {}
    };
    const onWelcome = (event: MessageEvent) => {
      try {
        const welcome = JSON.parse(event.data) as WelcomeEvent;
        if (welcome.raidId && welcome.audioUrl) {
          welcomes.current.set(welcome.raidId, welcome);
          if (welcomes.current.size > 10)
            welcomes.current.delete(welcomes.current.keys().next().value!);
        }
      } catch {}
    };
    source.addEventListener("recap", onRecap);
    source.addEventListener("recap-welcome", onWelcome);
    return () => {
      window.removeEventListener("resize", resize);
      source.close();
    };
  }, [cancel]);
  const total =
    recap?.segments.reduce((sum, segment) => sum + segment.text.length, 0) || 1;
  let consumed = 0;
  const index =
    recap?.segments.findIndex((segment) => {
      consumed += segment.text.length;
      return progress < consumed / total;
    }) ?? 0;
  const segmentIndex = index < 0 ? (recap?.segments.length ?? 1) - 1 : index;
  const segment = recap?.segments[segmentIndex];
  const moment =
    segment && segment.momentIndex >= 0
      ? recap?.moments[segment.momentIndex]
      : undefined;
  const clip =
    segment && segment.momentIndex >= 0
      ? recap?.clipIds[segment.momentIndex]
      : null;
  return (
    <main
      className="broadcast-root"
      onPointerDown={unlock}
      aria-label="Previously On OBS overlay"
    >
      <audio ref={audio} preload="auto" />
      {!recap && browserTab && (
        <section className="overlay-idle" aria-label="Overlay preview">
          <span className="brand-mark" aria-hidden="true">
            »
          </span>
          <p>Overlay is idle and transparent in OBS. Waiting for a raid.</p>
          <button
            className="tactile"
            disabled={loading}
            onClick={() => void play()}
          >
            {loading ? "Loading preview…" : "Play preview"}
          </button>
          {error && (
            <p role="alert" className="overlay-preview-error">
              {error}
            </p>
          )}
        </section>
      )}
      {recap && (
        <div
          className="broadcast-viewport"
          style={{ transform: `scale(${scale})` }}
        >
          <div
            ref={stage}
            className={`broadcast-stage phase-${phase}`}
            key={recap.raidId}
          >
            <div className="broadcast-bug">
              <span className="brand-mark">»</span>
              <span>
                PREVIOUSLY ON <b>/</b> {recap.channel}
              </span>
              <span className="broadcast-live">STREAM MEMORY</span>
            </div>
            <section
              className="broadcast-title"
              aria-hidden={phase !== "title"}
            >
              <div className="title-index">01 / THE STORY SO FAR</div>
              <h1 className="display">
                {phase === "title" ? (
                  <DecryptedText text="PREVIOUSLY" />
                ) : (
                  "PREVIOUSLY"
                )}
                <br />
                <span>ON.</span>
              </h1>
              <div className="broadcast-channel">
                <span />
                {recap.channel}
                <span />
              </div>
              <div className="title-caption">NEW FACES. SAME STORY.</div>
              <div className="title-chevrons display" aria-hidden="true">
                »
              </div>
            </section>
            <section
              className="broadcast-story"
              aria-hidden={phase !== "story"}
            >
              <div className="broadcast-frame">
                <div className="broadcast-frame-label">
                  <span>EARLIER THIS STREAM</span>
                  <span>
                    {String(segmentIndex + 1).padStart(2, "0")} /{" "}
                    {String(recap.segments.length).padStart(2, "0")}
                  </span>
                </div>
                {phase === "story" &&
                  (clip ? (
                    <iframe
                      key={clip}
                      title="Earlier stream clip"
                      src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=true`}
                      allow="autoplay; fullscreen"
                    />
                  ) : (
                    <div key={segmentIndex} className="broadcast-moment">
                      <span className="broadcast-moment-number display">
                        {String(segmentIndex + 1).padStart(2, "0")}
                      </span>
                      <p className="broadcast-eyebrow">
                        {moment ? "A MOMENT TO REMEMBER" : "THE STORY SO FAR"}
                      </p>
                      <h2 className="display">
                        {moment?.title || recap.channel}
                      </h2>
                      <p>
                        {moment?.detail ||
                          "The highlights, the near misses, and the bits that stuck. Welcome to the story."}
                      </p>
                    </div>
                  ))}
                <div className="broadcast-progress">
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
              <div className="broadcast-subtitle">
                {phase === "story" && segment && (
                  <SplitText key={segmentIndex} text={segment.text} />
                )}
              </div>
            </section>
            <section
              className="broadcast-welcome"
              aria-hidden={phase !== "welcome" && phase !== "out"}
            >
              <div className="welcome-stripe" />
              <span className="broadcast-eyebrow">
                A NEW COMMUNITY ENTERS THE STORY
              </span>
              <h2 className="display">
                WELCOME IN,
                <br />
                <span>
                  {phase === "welcome" || phase === "out" ? (
                    <DecryptedText text={recap.raider.name} />
                  ) : (
                    recap.raider.name
                  )}
                </span>
                RAIDERS.
              </h2>
              <div className="broadcast-viewers">
                <strong className="display">+{recap.raider.viewers}</strong>
                <span>
                  NEW FACES.
                  <br />
                  NEXT CHAPTER.
                </span>
              </div>
              <p className="broadcast-catchup">
                Missed the plot? <b>!catchup</b> in chat.
              </p>
            </section>
            <div className="broadcast-footer">
              <span>AI NARRATION</span>
            </div>
            {blocked && (
              <button className="broadcast-unlock tactile" onClick={unlock}>
                Click to enable narrator audio ↗
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
