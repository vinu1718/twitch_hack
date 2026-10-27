"use client";
// React Bits DecryptedText, installed with its TS-TW registry. Focused anime.js adaptation; see REACT_BITS.md.
import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { useReducedMotion } from "./motion/use-reduced-motion";
export default function DecryptedText({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;
    const state = { value: 0 };
    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/";
    const animation = animate(state, {
      value: 1,
      duration: 520,
      delay,
      ease: "linear",
      onUpdate: () => {
        const resolved = Math.floor(text.length * state.value);
        node.textContent = Array.from(text)
          .map((letter, index) =>
            index < resolved || /\s/.test(letter)
              ? letter
              : glyphs[
                  (index * 7 + Math.floor(state.value * 30)) % glyphs.length
                ],
          )
          .join("");
      },
      onComplete: () => {
        node.textContent = text;
      },
    });
    return () => {
      animation.cancel();
      node.textContent = text;
    };
  }, [text, reduced, delay]);
  return (
    <span className={className} aria-label={text}>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
