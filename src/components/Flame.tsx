import { useEffect, useRef } from "react";
import gsap from "gsap";

const FLAME_COLS = 4;
const FLAME_ROWS = 4;
const MAX_FRAME = FLAME_COLS * FLAME_ROWS - 1;

const BAND_LABELS = ["火種", "小炎", "中炎", "聖火"] as const;

interface FlameProps {
  frame: number;
  band: number;
  /** Increment this whenever a fresh ignite result arrives, to trigger the pop. */
  pulseKey: number;
  leveledUp: boolean;
  /** While generating: the flame "kindles" (subtle building animation). */
  kindling: boolean;
  reducedMotion: boolean;
}

function framePosition(frame: number): { x: string; y: string } {
  const clamped = Math.min(MAX_FRAME, Math.max(0, frame));
  const col = clamped % FLAME_COLS;
  const row = Math.floor(clamped / FLAME_COLS);
  return {
    x: `${(col / (FLAME_COLS - 1)) * 100}%`,
    y: `${(row / (FLAME_ROWS - 1)) * 100}%`,
  };
}

export function Flame({ frame, band, pulseKey, leveledUp, kindling, reducedMotion }: FlameProps) {
  const spriteRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const idleTweens = useRef<gsap.core.Tween[]>([]);

  // Idle flicker — skipped entirely when the user prefers reduced motion.
  useEffect(() => {
    if (reducedMotion) return;
    const sprite = spriteRef.current;
    const glow = glowRef.current;
    if (!sprite || !glow) return;

    const spriteTween = gsap.to(sprite, {
      scale: 1.05,
      duration: 0.5,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
    const glowTween = gsap.to(glow, {
      opacity: 0.75,
      scale: 1.08,
      duration: 0.9,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
    idleTweens.current = [spriteTween, glowTween];
    return () => {
      spriteTween.kill();
      glowTween.kill();
      idleTweens.current = [];
    };
  }, [reducedMotion]);

  // Pop / level-up burst on each new result.
  useEffect(() => {
    if (pulseKey === 0 || reducedMotion) return;
    const sprite = spriteRef.current;
    const glow = glowRef.current;
    if (!sprite || !glow) return;

    idleTweens.current.forEach((t) => t.pause());
    const intensity = leveledUp ? 1.45 : 1.18;
    const tl = gsap.timeline({
      onComplete: () => idleTweens.current.forEach((t) => t.restart()),
    });
    tl.fromTo(
      sprite,
      { scale: intensity, filter: "brightness(1.8)" },
      { scale: 1, filter: "brightness(1)", duration: 0.7, ease: "elastic.out(1, 0.5)" },
    );
    tl.fromTo(
      glow,
      { opacity: 1, scale: leveledUp ? 1.6 : 1.25 },
      { opacity: 0.55, scale: 1, duration: 0.9, ease: "power2.out" },
      0,
    );
    return () => {
      tl.kill();
    };
  }, [pulseKey, leveledUp, reducedMotion]);

  const pos = framePosition(frame);
  const label = BAND_LABELS[Math.min(BAND_LABELS.length - 1, Math.max(0, band))];

  return (
    <div className={`flame-stage${kindling ? " is-kindling" : ""}`}>
      <div ref={glowRef} className="flame-glow" aria-hidden />
      <div className="flame-embers" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div
        ref={spriteRef}
        className="flame-sprite"
        role="img"
        aria-label={`炎レベル ${frame + 1} / ${MAX_FRAME + 1}（${label}）`}
        style={{ backgroundPosition: `${pos.x} ${pos.y}` }}
      />
      <div className="flame-band">{label}</div>
    </div>
  );
}
