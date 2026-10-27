"use client";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";
export default function HeroGradient() {
  return (
    <ShaderGradientCanvas
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      pixelDensity={1}
    >
      <ShaderGradient
        type="plane"
        animate="on"
        uSpeed={0.12}
        uStrength={2}
        uFrequency={4}
        uDensity={1.3}
        color1="#9146FF"
        color2="#281747"
        color3="#0E0E10"
        brightness={0.85}
        grain="off"
        lightType="3d"
        cDistance={3.8}
        cPolarAngle={100}
        cAzimuthAngle={180}
        rotationZ={40}
      />
    </ShaderGradientCanvas>
  );
}
