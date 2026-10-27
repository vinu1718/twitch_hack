"use client";
import { useEffect, useState } from "react";
import type { StreamHealth } from "@/lib/health";
export function useHealth() {
  const [health, setHealth] = useState<StreamHealth | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5_000),
          ]),
        });
        if (!response.ok) throw new Error("Health unavailable");
        const snapshot = (await response.json()) as StreamHealth;
        if (!controller.signal.aborted) {
          setHealth(snapshot);
          setOffline(false);
        }
      } catch {
        if (!controller.signal.aborted) setOffline(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 5_000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return { health, offline };
}
