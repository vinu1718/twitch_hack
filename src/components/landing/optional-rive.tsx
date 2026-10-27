"use client";
import { useRive } from "@rive-app/react-canvas";
import { useState } from "react";
export default function OptionalRive({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const { RiveComponent } = useRive({
    src,
    autoplay: true,
    onLoadError: () => setFailed(true),
  });
  return failed ? null : (
    <RiveComponent aria-label="Channel memory animation" />
  );
}
