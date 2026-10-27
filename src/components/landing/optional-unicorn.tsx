"use client";
import Script from "next/script";
import { useEffect, useId, useState } from "react";
type Scene = { destroy(): void };
type SDK = {
  addScene(options: {
    elementId: string;
    projectId: string;
    fps: number;
    dpi: number;
    scale: number;
    production: boolean;
  }): Promise<Scene>;
};
export default function OptionalUnicorn({ projectId }: { projectId: string }) {
  const [ready, setReady] = useState(false);
  const id = useId().replace(/:/g, "_");
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let scene: Scene | undefined;
    const sdk = (window as Window & { UnicornStudio?: SDK }).UnicornStudio;
    void sdk
      ?.addScene({
        elementId: id,
        projectId,
        fps: 30,
        dpi: 1,
        scale: 0.75,
        production: true,
      })
      .then((created) => {
        if (disposed) created.destroy();
        else scene = created;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      scene?.destroy();
    };
  }, [ready, projectId, id]);
  return (
    <>
      <Script
        id="unicorn-sdk"
        src="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.4.3/dist/unicornStudio.umd.js"
        onReady={() => setReady(true)}
      />
      <div
        id={id}
        className="optional-scene"
        aria-label="Published stream identity animation"
      />
    </>
  );
}
