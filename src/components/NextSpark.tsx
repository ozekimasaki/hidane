import { SparklesIcon, ArrowRightIcon } from "./icons.tsx";

interface NextSparkProps {
  text: string;
  onUse: () => void;
  disabled: boolean;
}

export function NextSpark({ text, onUse, disabled }: NextSparkProps) {
  return (
    <div className="next-spark">
      <div className="next-spark-head">
        <SparklesIcon size={14} /> 次の火花
      </div>
      <p className="next-spark-text">{text}</p>
      <button type="button" className="next-spark-button" onClick={onUse} disabled={disabled}>
        これに挑戦する <ArrowRightIcon size={16} />
      </button>
    </div>
  );
}
