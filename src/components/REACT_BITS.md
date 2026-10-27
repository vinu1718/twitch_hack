# React Bits source components

Installed through the official registry with:

`npx shadcn@latest add @react-bits/DecryptedText-TS-TW @react-bits/SplitText-TS-TW @react-bits/AnimatedContent-TS-TW --yes`

Sources: https://reactbits.dev/text-animations/decrypted-text, https://reactbits.dev/text-animations/split-text, https://reactbits.dev/animations/animated-content.

These source-owned components are deliberately trimmed to the features used by Previously On. The original motion/GSAP/ScrollTrigger implementations are replaced with finite anime.js v4 animations, the same engine as the overlay. This removes additional scroll engines, hover physics, looping animations, and idle tickers. Each instance cancels on unmount and respects reduced motion. Real text is present in server HTML and accessible labels remain stable during scrambling.
