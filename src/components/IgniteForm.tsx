import { useState, type FormEvent } from "react";
import { FlameIcon, SparklesIcon } from "./icons.tsx";

const EXAMPLES = [
  "サイコロを振るページを作って",
  "クリックで数えるカウンター",
  "やることリスト",
  "ストップウォッチ",
];

interface IgniteFormProps {
  onSubmit: (wish: string) => void;
  loading: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function IgniteForm({ onSubmit, loading, value, onChange }: IgniteFormProps) {
  const [touched, setTouched] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const wish = value.trim();
    if (wish) onSubmit(wish);
  }

  return (
    <form className="ignite-form" onSubmit={handleSubmit}>
      <label htmlFor="wish" className="ignite-label">
        作ってみたいものは？
      </label>
      <textarea
        id="wish"
        className="ignite-input"
        placeholder="例：サイコロを振るページを作って"
        value={value}
        rows={2}
        maxLength={500}
        disabled={loading}
        onChange={(e) => onChange(e.target.value)}
      />
      {touched && !value.trim() && (
        <p className="ignite-hint" role="alert">
          やりたいことを入力してください。
        </p>
      )}

      <div className="examples">
        <SparklesIcon size={15} className="examples-icon" />
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="example-chip"
            disabled={loading}
            onClick={() => onChange(ex)}
          >
            {ex}
          </button>
        ))}
      </div>

      <button type="submit" className="ignite-button" disabled={loading}>
        <FlameIcon size={20} />
        {loading ? "着火中…" : "火をつける"}
      </button>
    </form>
  );
}
