"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
export function ClientTime({ value }: { value: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <time dateTime={value} className="text-xs text-slate-500">{mounted ? new Date(value).toLocaleTimeString() : ""}</time>;
}
