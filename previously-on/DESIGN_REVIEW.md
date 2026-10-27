# Design review — Previously On

## Scope and rollback

Before the design pass, all existing feature and hardening work was committed as `d8c5f08` (`Add raid recap and live-test hardening`). This pass changes presentation, browser animation, fonts, UI dependencies, and documentation. No files under `src/lib`, `src/app/api`, or `src/instrumentation.ts` changed.

## Screenshots

Captured from an isolated copy of the production standalone build at 1280×720. The overlay scales its native 1920×1080 canvas to that viewport. Fixtures supply connected health, synthetic silent microphone capture, standby memory, and raid events; no real chat messages, microphones, credentials, or paid model calls were used. The illustrated gameplay backdrop exists only in the temporary review proxy, never in the app.

- [Landing](design-review/landing.png)
- [Dashboard: connected, recording, recap ready](design-review/dashboard.png)
- [Overlay: resolved title](design-review/overlay-title.png)
- [Overlay: story and subtitles](design-review/overlay-story.png)
- [Overlay: welcome](design-review/overlay-welcome.png)

The title/story use normal 14 second silent fixture narration. A one second main-audio fixture made the short welcome stage easier to capture; it does not alter production timing or layout.

## Critical review and final self-assessment

These are design review scores, not an independent accessibility certification or an OBS hardware benchmark.

| Dimension | Initial | Final | Change made during review |
| --- | --- | --- | --- |
| First-glance clarity | 8 | 9 | Three large named status cards; stronger telemetry type; landing action fits a 720px opening frame. |
| Readability over gameplay | 8 | 9 | 46px native subtitles with a nearly opaque backdrop; left-aligned story/welcome panels preserve the center; corrected title color hierarchy. |
| Motion quality | 8 | 9 | One audio-scrubbed anime.js composition; finite scramble/word reveals; removed redundant welcome spacing; calm story middle and short fade exit. |
| Consistency | 8 | 9 | Anton + Geist through next/font, shared acid accent, dark surfaces, spacing tokens, shared tactile/focus controls. |
| Accessibility | 8 | 9 | Visible keyboard focus, named controls, text with status colors, reduced-motion paths, keyboard-scrollable panels; removed scroll-linked text dimming so story copy stays readable. |
| OBS performance | 8 | 9 | No overlay WebGL; finite animation cleanup; no recap subtree when idle; heavy effects restricted to the landing page and dynamically imported. |

## Verification

- `npm test`: all 16 existing tests pass, including refresh/reconnect/queue/fallback and server-rendered time coverage.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build`: pass.
- Simulated two raids during active playback: only one stage remained mounted and the first raider remained current; the next recap followed completion.
- Browser instrumentation sampled **pending RAF = 0, WebGL contexts = 0** before playback and again after both queued recaps ended.
- Dashboard had zero canvases and body scroll height equal to the 720px viewport. Long control/memory regions scroll internally.
- Native overlay subtitle CSS is 46px. No shader, Lenis, Rive, or Unicorn is imported by the overlay or dashboard.
- Token contrast calculations: main text/ink 17.76:1; muted/surface 8.29:1; muted/raised 7.54:1; accent/ink 17.44:1; accent ink/accent 15.11:1; semantic state colors/surface all above 10:1.
- Reviewed reduced-motion branches and CSS: no scramble, smooth scrolling, shader, or large movement. A system preference change also cancels/replaces finite component motion.
- Optional Rive/Unicorn assets were left unset; their static fallbacks were reviewed. Real authored assets require a separate visual check after configuration.

Still validate actual narrator delivery, clip loading, and frame pacing inside the final OBS scene on the stream machine. The browser review does not establish a hardware-specific OBS performance result.

## References and implementation

Visual references: [basement.studio](https://basement.studio/) and [Dqnamo Kitchen](https://www.dqnamo.com/kitchen). No code or assets were copied from either.

Documentation checked before integration: [anime.js timeline](https://animejs.com/documentation/timeline/), [onScroll](https://animejs.com/documentation/events/onscroll/), [React Bits installation](https://reactbits.dev/get-started/installation), [ShaderGradient](https://github.com/ruucm/shadergradient), [Lenis](https://github.com/darkroomengineering/lenis), [Rive React](https://rive.app/docs/runtimes/react/react), and [Unicorn Studio SDK](https://github.com/hiunicornstudio/unicornstudio.js). React Bits source provenance and the focused anime.js adaptations are in `src/components/REACT_BITS.md`.

## Light mode follow-up

Added a shared, labeled theme control to both headers, with a system default, persistent browser preference, cross-tab synchronization, and pre-paint initialization. Light mode uses warm white surfaces, dark ink, accessible olive accent text, and the original yellow button fills. Status and telemetry colors are adjusted for light surfaces. The overlay retains its dark tokens and transparent background regardless of UI theme.

Reviewed [light dashboard](design-review/dashboard-light.png) and [light landing](design-review/landing-light.png), verified reload persistence and cross-tab switching, and inspected the idle overlay in light mode: transparent background, original dark ink/white text tokens, and zero canvases.

## Mid-stream simplification

The default dashboard now shows the three status cards, a large mic button/waveform, and current AI context. Removed the hero, control-room label, setup card, taglines, mic promotional copy, and permanent health sidebar. Memory/lore, tests, and debugging are collapsed at the bottom. Moment counts are actual counts. The dashboard theme control is icon-only, and browser audio guidance lives on the overlay link tooltip. Connection and missing required subscription failures turn the Twitch card red; mic and summary recency sit next to their respective controls. Token expiry is hidden; the existing health payload does not expose refresh-failure details.

The overlay retains only the small AI narration label in its footer. Browser tabs get a static idle hint with Play preview; OBS gets no idle hint. The new read-only standby GET and its snapshot accessor are the only server changes. Preview audio is copied into a browser blob so normal standby cleanup cannot remove it mid-playback. Preview playback is separate from the real queue, yields to real raids, and never sends a playback acknowledgment.

Screenshots: [trimmed dashboard](design-review/dashboard-trimmed.png), [idle browser overlay](design-review/overlay-idle.png). Tests cover cold/warm standby reads, snapshot isolation, fallback and failure responses, credentials exclusion, missing subscriptions, and preview cleanup skipping the raid completion endpoint.
