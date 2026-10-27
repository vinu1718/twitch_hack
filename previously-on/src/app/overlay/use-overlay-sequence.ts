"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { animate, createTimeline } from "animejs";
import type { RecapEvent, WelcomeEvent } from "@/lib/recap-types";
export type OverlayPhase = "title" | "story" | "welcome" | "out";

export function useOverlaySequence(
  recap: RecapEvent | null,
  welcomes: RefObject<Map<string, WelcomeEvent>>,
  complete: (id: string) => void,
  previewOnly = false,
) {
  const audio = useRef<HTMLAudioElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<OverlayPhase>("title");
  const [progress, setProgress] = useState(0);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!recap || !audio.current || !stage.current) return;
    const current = recap;
    const controller = new AbortController();
    const signal = controller.signal;
    const element = audio.current;
    const welcomeEvents = welcomes.current;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const target = stage.current;
    const title = target.querySelector(".broadcast-title")!;
    const story = target.querySelector(".broadcast-story")!;
    const welcome = target.querySelector(".broadcast-welcome")!;
    // One master composition; audio progress scrubs its calm middle instead of a second clock.
    const timeline = createTimeline({
      autoplay: false,
      defaults: { ease: "outCubic" },
    })
      .label("title", 0)
      .add(target, { opacity: [0, 1], duration: 160 }, 0)
      .add(
        title,
        { opacity: [0, 1], x: reduced ? 0 : [-80, 0], duration: 420 },
        0,
      )
      .add(
        title,
        { opacity: [1, 0], x: reduced ? 0 : [0, -18], duration: 180 },
        1000,
      )
      .label("story", 1200)
      .add(
        story,
        { opacity: [0, 1], y: reduced ? 0 : [18, 0], duration: 180 },
        1040,
      )
      .add(story, { opacity: [1, 0], duration: 180 }, 15300)
      .label("welcome", 15500)
      .add(
        welcome,
        { opacity: [0, 1], x: reduced ? 0 : [-28, 0], duration: 260 },
        15500,
      )
      .label("exit", 19600)
      .add(target, { opacity: [1, 0], duration: 400 }, 19600);
    timeline.seek(0, true);
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    const drive = (from: number, to: number, duration: number) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        const clock = { time: from };
        const done = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const animation = animate(clock, {
          time: to,
          duration,
          ease: "linear",
          onUpdate: () => timeline.seek(clock.time, true),
          onComplete: done,
        });
        const abort = () => {
          animation.cancel();
          done();
        };
        signal.addEventListener("abort", abort, { once: true });
      });
    async function play(url: string, track = false): Promise<void> {
      if (signal.aborted) return;
      if (!url) {
        for (let step = 0; step < 140 && !signal.aborted; step++) {
          const ratio = step / 140;
          if (track) {
            setProgress(ratio);
            timeline.seek(1200 + ratio * 14000, true);
          }
          await delay(100);
        }
        return;
      }
      let failed = false;
      await new Promise<void>((resolve) => {
        const rate = () => {
          if (Number.isFinite(element.duration) && element.duration > 0)
            element.playbackRate = Math.max(
              1,
              element.duration / (track ? 14 : 2),
            );
        };
        const update = () => {
          if (!Number.isFinite(element.duration) || element.duration <= 0)
            return;
          const ratio = element.currentTime / element.duration;
          if (track) {
            setProgress(ratio);
            timeline.seek(1200 + ratio * 14000, true);
          } else timeline.seek(15800 + ratio * 3600, true);
        };
        const done = () => {
          clearTimeout(timeout);
          element.removeEventListener("ended", done);
          element.removeEventListener("error", error);
          element.removeEventListener("timeupdate", update);
          element.removeEventListener("loadedmetadata", rate);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const error = () => {
          failed = true;
          done();
        };
        const timeout = setTimeout(done, 60_000);
        element.addEventListener("ended", done, { once: true });
        element.addEventListener("error", error, { once: true });
        element.addEventListener("timeupdate", update);
        element.addEventListener("loadedmetadata", rate);
        signal.addEventListener("abort", done, { once: true });
        if (element.getAttribute("src") !== url) element.src = url;
        rate();
        element
          .play()
          .then(() => {
            if (!signal.aborted) setBlocked(false);
          })
          .catch((cause: unknown) => {
            if (signal.aborted) return;
            if (
              cause instanceof DOMException &&
              cause.name === "NotAllowedError"
            )
              setBlocked(true);
            else error();
          });
      });
      if (failed && track && !signal.aborted) await play("", true);
      if (track && !signal.aborted) setProgress(1);
    }
    async function run() {
      setBlocked(false);
      setProgress(0);
      setPhase("title");
      if (current.audioUrl) {
        element.src = current.audioUrl;
        element.load();
      }
      await drive(0, 1200, reduced ? 250 : 1200);
      if (signal.aborted) return;
      setPhase("story");
      await play(current.audioUrl, true);
      if (signal.aborted) return;
      element.pause();
      setBlocked(false);
      setPhase("welcome");
      await drive(15200, 15800, reduced ? 150 : 220);
      if (previewOnly) await delay(1_800);
      const deadline = Date.now() + 3_000;
      while (
        !previewOnly &&
        !welcomeEvents.has(current.raidId) &&
        Date.now() < deadline &&
        !signal.aborted
      )
        await delay(100);
      const arriving = welcomeEvents.get(current.raidId);
      if (!signal.aborted && arriving) await play(arriving.audioUrl);
      if (signal.aborted) return;
      await delay(450);
      setPhase("out");
      await drive(19600, 20000, reduced ? 180 : 400);
      if (!signal.aborted) complete(current.raidId);
    }
    void run();
    return () => {
      controller.abort();
      timeline.revert();
      element.pause();
      element.removeAttribute("src");
      element.load();
      welcomeEvents.delete(current.raidId);
      if (!previewOnly)
        void fetch("/api/recaps/playback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raidId: current.raidId }),
          keepalive: true,
        }).catch(() => undefined);
    };
  }, [recap, welcomes, complete, previewOnly]);
  function unlock() {
    const element = audio.current;
    if (!element) return;
    if (!recap)
      element.src =
        "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==";
    void element
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }
  return { audio, stage, phase, progress, blocked, unlock };
}
