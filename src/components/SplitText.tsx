"use client";
// React Bits SplitText TS-TW: word entrance adapted to the shared anime.js engine.
import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { useReducedMotion } from "./motion/use-reduced-motion";
export default function SplitText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    const animation = animate(ref.current.children, {
      opacity: [0, 1],
      y: reduced ? 0 : [7, 0],
      duration: reduced ? 120 : 220,
      delay: reduced ? 0 : stagger(12),
      ease: "outCubic",
    });
    return () => {
      animation.revert();
    };
  }, [text, reduced]);
  return (
    <span className={className} aria-label={text} ref={ref}>
      {text.split(/\s+/).map((word, index) => (
        <span className="split-word" aria-hidden="true" key={index}>
          {word}{" "}
        </span>
      ))}
    </span>
  );
}
