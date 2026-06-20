export const FLAME_FRAMES = 16;
export const FLAME_MAX_FRAME = FLAME_FRAMES - 1;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Learning "heat" score. Intentionally weights repeated practice (turns),
 * breadth (unique concepts), and consistency (streak, capped at a week) so the
 * flame reliably grows within a few demo turns.
 */
export function computeScore(
  turnCount: number,
  uniqueConcepts: number,
  streakDays: number,
): number {
  return turnCount * 2 + uniqueConcepts * 3 + Math.min(streakDays, 7) * 5;
}

export function scoreToFrame(score: number): number {
  return clamp(Math.floor(score / 5), 0, FLAME_MAX_FRAME);
}

/** 0: 火種 / 1: 小炎 / 2: 中炎 / 3: 大炎(聖火) */
export function frameToBand(frame: number): number {
  return clamp(Math.floor(frame / 4), 0, 3);
}

export const BAND_LABELS = ["火種", "小炎", "中炎", "聖火"] as const;
