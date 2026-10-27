"use client";
// React Bits AnimatedContent TS-TW: finite mount animation; no scroll plugin or idle ticker.
import { useEffect, useRef, type ReactNode } from "react";
import { animate } from "animejs";
import { useReducedMotion } from "./motion/use-reduced-motion";
export default function AnimatedContent({
  children,
  className = "",
  delay = 0,
  distance = 10,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    const animation = animate(ref.current, {
      opacity: [0, 1],
      y: reduced ? 0 : [distance, 0],
      duration: reduced ? 120 : 380,
      delay: reduced ? 0 : delay,
      ease: "outCubic",
    });
    return () => {
      animation.revert();
    };
  }, [reduced, distance, delay]);
  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}
