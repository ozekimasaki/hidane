export interface FlameState {
  frame: number;
  band: number;
  deltaFrame: number;
  score: number;
  streakDays: number;
  turnCount: number;
  uniqueConcepts: number;
}

export interface IgniteResponse {
  sessionId: string;
  previewPath: string;
  explanation: string;
  next_spark: string;
  concepts: string[];
  flame: FlameState;
  source: "ai" | "fallback";
  usedMemory: boolean;
}

export interface StoredResult {
  sessionId: string;
  explanation: string;
  next_spark: string;
  concepts: string[];
  source: "ai" | "fallback";
  usedMemory: boolean;
}

export interface StateResponse {
  flame: FlameState;
  last: StoredResult | null;
}
