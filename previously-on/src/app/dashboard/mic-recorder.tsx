"use client";

import { useEffect, useRef, useState } from "react";

const CHUNK_MS = 30_000;

function recordingOptions(): MediaRecorderOptions | undefined {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

export function MicRecorder() {
  const [capture, setCapture] = useState<"idle" | "starting" | "recording">("idle");
  const [upload, setUpload] = useState<"idle" | "uploading" | "ok" | "error">("idle");
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
    void fetch("/api/mic", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: recordingId.current, recording }), keepalive: !recording,
      signal: AbortSignal.timeout(5_000),
    }).catch(() => { /* The lease expires if the tab or server disconnects. */ });
  }

  function stopTracks() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  function stop() {
    active.current = false;
    announce(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else stopTracks();
    if (mounted.current) setCapture("idle");
  }

  function queueUpload(blob: Blob, mimeType: string) {
    if (!blob.size) return;
    uploadTail.current = uploadTail.current.catch(() => undefined).then(async () => {
      if (mounted.current) setUpload("uploading");
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.set("audio", blob, `mic-${Date.now()}.${extension}`);
      const response = await fetch("/api/transcribe", { method: "POST", body: form, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status})`);
      if (mounted.current) {
        setUpload("ok");
        setError("");
      }
    }).catch((cause) => {
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
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setUpload("error");
      setError("This browser does not support microphone recording");
      return;
    }
    setCapture("starting");
    setError("");
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = microphone;
      active.current = true;
      announce(true);
      microphone.getAudioTracks().forEach((track) => { track.onended = stop; });
      recordNext();
    } catch {
      setCapture("idle");
      setUpload("error");
      setError("Microphone access was denied or unavailable");
    }
  }

  useEffect(() => {
    mounted.current = true;
    const heartbeat = setInterval(() => { if (active.current) announce(true); }, 20_000);
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
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Microphone</h2>
          <p className="text-sm text-slate-400">Fresh 30 second recordings feed the stream memory.</p>
        </div>
        <button
          type="button"
          onClick={capture === "recording" ? stop : start}
          disabled={capture === "starting"}
          className="rounded-lg bg-violet-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
        >
          {capture === "recording" ? "Stop" : capture === "starting" ? "Starting…" : "Start"}
        </button>
      </div>
      <p role="status" className="mt-3 text-sm text-slate-300">
        {capture === "recording" ? "Recording" : capture === "starting" ? "Starting" : "Stopped"}
        {upload === "uploading" ? " · Uploading" : upload === "ok" ? " · Last chunk ok" : upload === "error" ? " · Error" : ""}
      </p>
      {error && <p className="mt-1 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
