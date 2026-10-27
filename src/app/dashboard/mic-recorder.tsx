"use client";

import { useEffect, useRef, useState } from "react";

const CHUNK_MS = 30_000;

function recordingOptions(): MediaRecorderOptions | undefined {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
  return mimeType ? { mimeType } : undefined;
}

export function MicRecorder({
  onCaptureChange,
}: {
  onCaptureChange?: (recording: boolean) => void;
}) {
  const [capture, setCapture] = useState<"idle" | "starting" | "recording">(
    "idle",
  );
  const [upload, setUpload] = useState<"idle" | "uploading" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const active = useRef(false);
  const mounted = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadTail = useRef<Promise<void>>(Promise.resolve());
  const recordingId = useRef("");

  function announce(recording: boolean) {
    recordingId.current ||= crypto.randomUUID();
    void fetch("/api/mic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: recordingId.current, recording }),
      keepalive: !recording,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      /* The lease expires if the tab or server disconnects. */
    });
  }

  function stopTracks() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  function stop() {
    active.current = false;
    announce(false);
    onCaptureChange?.(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else stopTracks();
    if (mounted.current) setCapture("idle");
  }

  function queueUpload(blob: Blob, mimeType: string) {
    if (!blob.size) return;
    uploadTail.current = uploadTail.current
      .catch(() => undefined)
      .then(async () => {
        if (mounted.current) setUpload("uploading");
        const extension = mimeType.includes("mp4") ? "mp4" : "webm";
        const form = new FormData();
        form.set("audio", blob, `mic-${Date.now()}.${extension}`);
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok)
          throw new Error(`Upload failed (HTTP ${response.status})`);
        if (mounted.current) {
          setUpload("ok");
          setError("");
        }
      })
      .catch((cause) => {
        if (mounted.current) {
          setUpload("error");
          setError(cause instanceof Error ? cause.message : "Upload failed");
        }
      });
  }

  function recordNext() {
    if (!active.current || !stream.current) return;
    try {
      const next = new MediaRecorder(stream.current, recordingOptions());
      const chunks: Blob[] = [];
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      next.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        if (recorder.current === next) recorder.current = null;
        if (active.current) recordNext();
        else stopTracks();
        queueUpload(new Blob(chunks, { type: next.mimeType }), next.mimeType);
      };
      next.onerror = () => {
        if (mounted.current) {
          setError("Microphone recording failed");
          setUpload("error");
        }
        stop();
      };
      recorder.current = next;
      next.start();
      timer.current = setTimeout(() => {
        if (next.state === "recording") next.stop();
      }, CHUNK_MS);
      if (mounted.current) setCapture("recording");
    } catch {
      active.current = false;
      announce(false);
      onCaptureChange?.(false);
      stopTracks();
      if (mounted.current) {
        setCapture("idle");
        setUpload("error");
        setError("Could not start the microphone recorder");
      }
    }
  }

  async function start() {
    if (active.current || capture === "starting") return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setUpload("error");
      setError("This browser does not support microphone recording");
      return;
    }
    setCapture("starting");
    setError("");
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!mounted.current) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = microphone;
      active.current = true;
      announce(true);
      onCaptureChange?.(true);
      microphone.getAudioTracks().forEach((track) => {
        track.onended = stop;
      });
      recordNext();
    } catch {
      setCapture("idle");
      setUpload("error");
      setError("Microphone access was denied or unavailable");
    }
  }

  useEffect(() => {
    mounted.current = true;
    const heartbeat = setInterval(() => {
      if (active.current) announce(true);
    }, 20_000);
    return () => {
      clearInterval(heartbeat);
      announce(false);
      mounted.current = false;
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      else stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <section
      aria-label="Microphone capture"
      className={`panel microphone-panel ${capture === "recording" ? "mic-is-recording" : ""}`}
    >
      <div className="mic-waveform" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => (
          <i key={i} style={{ height: `${15 + ((i * 31) % 70)}%` }} />
        ))}
      </div>
      <button
        type="button"
        onClick={capture === "recording" ? stop : start}
        disabled={capture === "starting"}
        className={`tactile mic-button ${capture === "recording" ? "stop-button" : ""}`}
      >
        <span aria-hidden="true">{capture === "recording" ? "■" : "●"}</span>
        {capture === "recording"
          ? "Stop recording"
          : capture === "starting"
            ? "Starting microphone…"
            : "Start recording"}
      </button>
      {(capture === "starting" ||
        upload === "uploading" ||
        upload === "error") && (
        <p role="status" className="mic-status">
          {capture === "starting"
            ? "Starting microphone…"
            : upload === "uploading"
              ? "Uploading chunk…"
              : "Chunk upload failed"}
        </p>
      )}
      {error && <p className="feedback error">{error}</p>}
    </section>
  );
}
