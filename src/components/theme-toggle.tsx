"use client";

import { useSyncExternalStore } from "react";

const key = "previously-on-theme";
const changed = "previously-on-theme-change";
function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const sync = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {}
    document.documentElement.dataset.theme =
      saved === "light" || saved === "dark"
        ? saved
        : media.matches
          ? "light"
          : "dark";
    listener();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) sync();
  };
  window.addEventListener(changed, listener);
  window.addEventListener("storage", storage);
  media.addEventListener("change", sync);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener("storage", storage);
    media.removeEventListener("change", sync);
  };
}
export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const theme = useSyncExternalStore(
    subscribe,
    () =>
      document.documentElement.dataset.theme === "light" ? "light" : "dark",
    () => "dark",
  );
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(key, next);
    } catch {}
    window.dispatchEvent(new Event(changed));
  }
  return (
    <button
      type="button"
      className="button-quiet theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>
      {!iconOnly && (
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      )}
    </button>
  );
}
