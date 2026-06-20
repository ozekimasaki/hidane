import { useEffect, useRef, useState } from "react";
import { Flame } from "./components/Flame.tsx";
import { IgniteForm } from "./components/IgniteForm.tsx";
import { NextSpark } from "./components/NextSpark.tsx";
import { FlameIcon, RefreshIcon, CheckIcon, BrainIcon } from "./components/icons.tsx";
import { getUserId, ignite, fetchState, IgniteError } from "./lib/api.ts";
import { useReducedMotion } from "./lib/useReducedMotion.ts";
import type { IgniteResponse } from "./lib/types.ts";

const ERROR_MESSAGES: Record<string, string> = {
  wish_required: "やりたいことを入力してください。",
  wish_too_long: "入力が長すぎます。もう少し短くしてください。",
  invalid_json: "リクエストの形式が正しくありません。",
  invalid_user: "セッションが無効です。ページを再読み込みしてください。",
  ignite_failed: "着火に失敗しました。もう一度お試しください。",
};

const LOADING_STEPS = [
  { icon: "brain", label: "これまでの学びを思い出しています" },
  { icon: "flame", label: "あなたの願いからコードを書いています" },
  { icon: "flame", label: "火を灯して、動かしています" },
] as const;

function MetaPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="pill">
      <span className="pill-value">{value}</span>
      <span className="pill-label">{label}</span>
    </div>
  );
}

const STEP_LABELS = ["願い", "生成", "着火", "次の火花"] as const;

function StepIndicator({ active }: { active: number }) {
  return (
    <ol className="steps" aria-label="進行状況">
      {STEP_LABELS.map((label, i) => (
        <li
          key={label}
          className={`step${i < active ? " done" : ""}${i === active ? " current" : ""}`}
          aria-current={i === active ? "step" : undefined}
        >
          <span className="step-dot">{i < active ? <CheckIcon size={12} /> : i + 1}</span>
          <span className="step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function LoadingPanel({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-rows">
        {LOADING_STEPS.map((s, i) => (
          <div key={s.label} className={`loading-row${i <= stepIndex ? " active" : ""}`}>
            <span className="loading-icon">
              {s.icon === "brain" ? <BrainIcon size={18} /> : <FlameIcon size={18} />}
            </span>
            <span>{s.label}</span>
            {i < stepIndex && <CheckIcon size={16} className="loading-check" />}
          </div>
        ))}
      </div>
      <div className="skeleton skeleton-preview" aria-hidden />
      <p className="loading-hint">最初の火がつくまで、少しだけ時間がかかります…</p>
    </div>
  );
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const [wish, setWish] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IgniteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const [loadStep, setLoadStep] = useState(0);
  const [justSucceeded, setJustSucceeded] = useState(false);
  const [booting, setBooting] = useState(true);
  const [userId] = useState(getUserId);
  const successTimer = useRef<number | null>(null);

  // Restore the persisted server state on load so a reload keeps the flame and
  // the most recent generated app instead of resetting to the empty screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await fetchState(userId);
      if (cancelled) return;
      if (state?.last) {
        const { last, flame } = state;
        setResult({
          sessionId: last.sessionId,
          previewPath: `/api/preview/${last.sessionId}`,
          explanation: last.explanation,
          next_spark: last.next_spark,
          concepts: last.concepts,
          flame,
          source: last.source,
          usedMemory: last.usedMemory,
        });
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Advance the loading narrative while we wait for generation.
  useEffect(() => {
    if (!loading) {
      setLoadStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setLoadStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 4500);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    return () => {
      if (successTimer.current) window.clearTimeout(successTimer.current);
    };
  }, []);

  async function handleIgnite(nextWish: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await ignite(userId, nextWish);
      setResult(res);
      setPulseKey((k) => k + 1);
      setJustSucceeded(true);
      if (successTimer.current) window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => setJustSucceeded(false), 2200);
    } catch (err) {
      const code = err instanceof IgniteError ? err.message : "ignite_failed";
      setError(ERROR_MESSAGES[code] ?? "予期しないエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  const flame = result?.flame;
  const heat = flame ? Math.min(100, Math.round(((flame.frame + 1) / 16) * 100)) : 0;
  const leveledUp = (flame?.deltaFrame ?? 0) > 0;
  const activeStep = loading ? 1 : result ? 3 : 0;

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <FlameIcon size={30} className="brand-icon" />
          <h1 className="title">
            Tanebi<span className="title-jp">種火</span>
          </h1>
        </div>
        <p className="subtitle">あなたの「作りたい」に、最初の火を。</p>
      </header>

      <StepIndicator active={activeStep} />

      <main className="layout">
        <section className="flame-panel">
          <Flame
            frame={flame?.frame ?? 0}
            band={flame?.band ?? 0}
            pulseKey={pulseKey}
            leveledUp={leveledUp}
            kindling={loading}
            reducedMotion={reducedMotion}
          />
          <div className="heat-meter" aria-label={`熱量 ${heat}パーセント`}>
            <div className="heat-fill" style={{ width: `${heat}%` }} />
          </div>
          <div className="heat-label">熱量 {heat}%</div>

          {flame ? (
            <div className="pills">
              <MetaPill label="ターン" value={flame.turnCount} />
              <MetaPill label="連続日数" value={flame.streakDays} />
              <MetaPill label="概念" value={flame.uniqueConcepts} />
            </div>
          ) : booting ? (
            <p className="flame-empty">これまでの火を確かめています…</p>
          ) : (
            <p className="flame-empty">ここに、あなたの炎が灯ります。<br />願いを入力して着火しよう。</p>
          )}
        </section>

        <section className="work-panel">
          <IgniteForm onSubmit={handleIgnite} loading={loading} value={wish} onChange={setWish} />

          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}

          {loading && <LoadingPanel stepIndex={loadStep} />}

          {result && !loading && (
            <div className={`result${justSucceeded && !reducedMotion ? " is-success" : ""}`}>
              <div className="result-head">
                <span className="result-title">
                  <CheckIcon size={18} /> 動いた！
                </span>
                <span className={`source-tag source-${result.source}`}>
                  {result.source === "ai" ? "AI生成" : "テンプレ生成"}
                </span>
                {result.usedMemory && (
                  <span className="memory-tag">
                    <BrainIcon size={13} /> 前回の学びを反映
                  </span>
                )}
              </div>

              <iframe
                key={result.sessionId}
                className="preview"
                src={result.previewPath}
                title="生成プレビュー"
                sandbox="allow-scripts"
                loading="lazy"
              />

              <p className="explanation">{result.explanation}</p>

              {result.concepts.length > 0 && (
                <div className="concepts" aria-label="習得した概念">
                  {result.concepts.map((c) => (
                    <span key={c} className="concept-badge">
                      {c}
                    </span>
                  ))}
                </div>
              )}

              <NextSpark
                text={result.next_spark}
                disabled={loading}
                onUse={() => {
                  setWish(result.next_spark);
                  void handleIgnite(result.next_spark);
                }}
              />

              <button
                type="button"
                className="regenerate"
                disabled={loading}
                onClick={() => void handleIgnite(wish.trim() || result.next_spark)}
              >
                <RefreshIcon size={16} /> もう一度ためす
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        Cloudflare Workers AI · Dynamic Workers · AI Search · D1 · Durable Objects
      </footer>
    </div>
  );
}
