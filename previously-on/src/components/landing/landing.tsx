"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { animate, onScroll, stagger } from "animejs";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import DecryptedText from "@/components/DecryptedText";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { RiveSlot, UnicornSlot } from "./authored-assets";
import { GradientBoundary } from "./gradient-boundary";
const HeroGradient = dynamic(() => import("./hero-gradient"), { ssr: false });

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [heroVisible, setHeroVisible] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!hero.current) return;
    const observer = new IntersectionObserver(([entry]) =>
      setHeroVisible(entry.isIntersecting),
    );
    observer.observe(hero.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (reduced || !root.current) return;
    const lenis = new Lenis({ autoRaf: true, anchors: true, duration: 1.05 });
    const animations = Array.from(
      root.current.querySelectorAll<HTMLElement>(
        ".story-section:not(.hero-section)",
      ),
    ).map((section) => {
      const observer = onScroll({
        target: section,
        enter: "bottom bottom",
        leave: "top top",
        sync: true,
      });
      const animation = animate(section.querySelectorAll(".scroll-reveal"), {
        y: [42, -12],
        delay: stagger(90),
        duration: 1000,
        ease: "linear",
        autoplay: observer,
      });
      return { animation, observer };
    });
    return () => {
      animations.forEach(({ animation, observer }) => {
        animation.revert();
        observer.revert();
      });
      lenis.destroy();
    };
  }, [reduced]);
  return (
    <div className="landing" ref={root}>
      <a href="#problem" className="skip-link">
        Skip to story
      </a>
      <nav className="site-nav">
        <Link
          prefetch={false}
          href="/"
          className="brand"
          aria-label="Previously On home"
        >
          <span className="brand-mark">»</span> Previously On
        </Link>
        <span className="eyebrow nav-note">THE STREAM HAS A STORY.</span>
        <a className="button-quiet" href="/dashboard">
          Enter the control room <span aria-hidden="true">↗</span>
        </a>
      </nav>
      <main>
        <section id="problem" className="story-section hero-section" ref={hero}>
          <div className="hero-foil" aria-hidden="true">
            {heroVisible && !reduced && (
              <GradientBoundary>
                <HeroGradient />
              </GradientBoundary>
            )}
            <div className="foil-lines" />
          </div>
          <div className="hero-topline eyebrow">
            <span>
              <span className="status-dot" /> LIVE STREAM MEMORY
            </span>
            <span>01 / THE ARRIVAL</span>
          </div>
          <h1 className="display hero-title">
            EVERY RAID.
            <br />
            <span className="accent">
              <DecryptedText text="IN ON THE STORY." delay={200} />
            </span>
          </h1>
          <div className="hero-bottom">
            <div className="hero-description">
              <p>
                They arrive halfway through.
                <br />
                Make them feel like they were here all along.
              </p>
              <p className="muted">
                A live memory of your stream. A cinematic catch-up for every new
                community.
              </p>
              <div className="hero-actions">
                <a className="tactile" href="/dashboard">
                  Start your story <span aria-hidden="true">↗</span>
                </a>
                <a className="text-link" href="#raid">
                  See the raid moment <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
            <div className="arrival-ticket">
              <span className="eyebrow">INCOMING RAID</span>
              <strong className="display">+142</strong>
              <span>new faces. same story.</span>
              <div className="ticket-cut" />
              <span className="ticket-code">PREVIOUSLY ON / EP.001</span>
            </div>
          </div>
          <div className="section-foot eyebrow">
            <span>BUILT FOR TWITCH. MADE FOR THE MOMENT.</span>
            <a href="#memory">SCROLL TO CATCH UP ↓</a>
          </div>
        </section>
        <section id="memory" className="story-section memory-section">
          <div className="section-intro scroll-reveal">
            <span className="eyebrow accent">02 / THE MEMORY</span>
            <h2 className="display">
              THE LITTLE THINGS.
              <br />
              THE WHOLE STORY.
            </h2>
            <p className="muted">
              The boss attempts. The chat bets. That one banana.
              <br />
              Mic and chat become a memory worth sharing.
            </p>
          </div>
          <div className="memory-grid scroll-reveal">
            <div className="memory-flow">
              <div>
                <span className="eyebrow">YOUR VOICE</span>
                <div className="wave-bars" aria-hidden="true">
                  {Array.from({ length: 28 }, (_, i) => (
                    <i key={i} style={{ height: `${14 + ((i * 23) % 65)}%` }} />
                  ))}
                </div>
                <p>“Okay. One more try.”</p>
              </div>
              <span className="flow-plus">+</span>
              <div>
                <span className="eyebrow">YOUR CHAT</span>
                <p>
                  <b>pixelghost</b> bridge boss 3 — streamer 0
                </p>
                <p>
                  <b>chat</b> trust the banana 🍌
                </p>
              </div>
              <span className="flow-arrow">↘</span>
              <div className="memory-result">
                <span className="eyebrow accent">ONE LIVE MEMORY</span>
                <h3>Third try. Same bridge.</h3>
                <p className="muted">
                  Chat is betting on another fall. The banana prophecy lives on.
                </p>
              </div>
            </div>
            <RiveSlot />
          </div>
        </section>
        <section id="raid" className="story-section raid-section">
          <div className="section-intro scroll-reveal">
            <span className="eyebrow accent">03 / THE RAID MOMENT</span>
            <h2 className="display">
              NEW PEOPLE.
              <br />
              INSTANT CONTEXT.
            </h2>
            <p className="muted">
              The recap is ready before the raid lands.
              <br />
              One entrance. A shared story. Welcome in.
            </p>
          </div>
          <div className="landing-preview scroll-reveal">
            <div className="preview-game" aria-hidden="true">
              <div className="game-sun" />
              <div className="game-ridge ridge-one" />
              <div className="game-ridge ridge-two" />
              <div className="game-grid" />
            </div>
            <div className="preview-bug eyebrow">
              <span className="status-dot" /> PREVIOUSLY ON / YOUR CHANNEL
            </div>
            <div className="preview-story">
              <span className="eyebrow">EARLIER THIS STREAM</span>
              <h3 className="display">
                THIRD TRY.
                <br />
                <span className="accent">SAME BRIDGE.</span>
              </h3>
              <p>Chat is betting on another fall.</p>
            </div>
            <div className="preview-caption">
              “And the banana prophecy refused to die.”
            </div>
            <span className="preview-time eyebrow">
              ~20 SECONDS. EVERYONE CAUGHT UP.
            </span>
          </div>
        </section>
        <section id="commands" className="story-section commands-section">
          <div className="section-intro scroll-reveal">
            <span className="eyebrow accent">
              04 / KEEP THE CONVERSATION GOING
            </span>
            <h2 className="display">
              MISSED THE PLOT?
              <br />
              ASK THE CHAT.
            </h2>
          </div>
          <div className="commands-grid scroll-reveal">
            <div>
              <article className="command-example">
                <code>!catchup</code>
                <p>
                  Third attempt at the bridge boss. Chat is betting on another
                  fall. The banana prophecy is still undefeated.
                </p>
              </article>
              <article className="command-example">
                <code>!lore banana</code>
                <p>
                  One banana emote before a fall. Now chat posts it before every
                  boss attempt. A prophecy was born.
                </p>
              </article>
            </div>
            <UnicornSlot />
          </div>
          <div className="landing-close scroll-reveal">
            <h3 className="display">
              MAKE THE NEXT RAID
              <br />
              <span className="accent">PART OF YOUR STORY.</span>
            </h3>
            <a className="tactile" href="/dashboard">
              Open the dashboard <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
      <footer className="site-footer eyebrow">
        <Link prefetch={false} className="brand" href="/">
          » Previously On
        </Link>
        <span>A CODEX × TWITCHCON BUILD</span>
        <span>LIVE STORIES. SHARED MEMORIES.</span>
      </footer>
    </div>
  );
}
