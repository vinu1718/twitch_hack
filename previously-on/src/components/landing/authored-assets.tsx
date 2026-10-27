"use client";
import dynamic from "next/dynamic";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { GradientBoundary } from "./gradient-boundary";
const Rive = dynamic(() => import("./optional-rive"), { ssr: false });
const Unicorn = dynamic(() => import("./optional-unicorn"), { ssr: false });
export function RiveSlot() {
  const reduced = useReducedMotion();
  const src = process.env.NEXT_PUBLIC_RIVE_SRC;
  return (
    <div className="identity-slot">
      <div className="signal-symbol" aria-hidden="true">
        <span>↗</span>
        <i />
        <i />
        <i />
      </div>
      {src && !reduced && (
        <GradientBoundary>
          <Rive src={src} />
        </GradientBoundary>
      )}
    </div>
  );
}
export function UnicornSlot() {
  const reduced = useReducedMotion();
  const projectId = process.env.NEXT_PUBLIC_UNICORN_PROJECT_ID;
  return (
    <div className="identity-slot foil-slot">
      <div className="foil-word display" aria-hidden="true">
        ON.
      </div>
      {projectId && !reduced && (
        <GradientBoundary>
          <Unicorn projectId={projectId} />
        </GradientBoundary>
      )}
    </div>
  );
}
