"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PreparedRecap, RecapEvent } from "@/lib/recap-types";

export function useOverlayPreview() {
  const [preview, setPreview] = useState<RecapEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const media = useRef<string | null>(null);
  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (media.current) URL.revokeObjectURL(media.current);
    media.current = null;
    setPreview(null);
    setLoading(false);
    setError("");
  }, []);
  const play = useCallback(async () => {
    cancel();
    const controller = new AbortController();
    request.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    setLoading(true);
    try {
      const response = await fetch("/api/recaps/standby", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Preview unavailable");
      const recap = (await response.json()) as PreparedRecap;
      if (
        !recap ||
        !Array.isArray(recap.segments) ||
        !recap.segments.length ||
        !Array.isArray(recap.moments) ||
        !Array.isArray(recap.clipIds)
      )
        throw new Error("Invalid preview");
      // Hold a browser-owned copy: a standby replacement may delete the server MP3 mid-preview.
      let audioUrl = "";
      if (recap.audioUrl) {
        try {
          const audio = await fetch(recap.audioUrl, { signal });
          if (audio.ok) {
            const blob = await audio.blob();
            if (!signal.aborted)
              audioUrl = media.current = URL.createObjectURL(blob);
          }
        } catch {
          /* Existing text cards remain usable if the audio has disappeared. */
        }
      }
      if (controller.signal.aborted) return;
      setPreview({
        ...recap,
        audioUrl,
        raidId: `preview-${crypto.randomUUID()}`,
        raider: { name: "SampleRaiders", viewers: 42 },
      });
    } catch {
      if (!controller.signal.aborted)
        setError("Could not load the preview. Please try again.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [cancel]);
  useEffect(
    () => () => {
      request.current?.abort();
      if (media.current) URL.revokeObjectURL(media.current);
    },
    [],
  );
  return { preview, loading, error, play, cancel };
}
