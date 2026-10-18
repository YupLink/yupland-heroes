import { useId } from "react";
import {
  castleLabelSize,
  LABEL_SIZE_DEFAULT,
  LABEL_SIZE_MAX,
  LABEL_SIZE_MIN,
} from "@/lib/castleLabelSize";

const copy = {
  ru: {
    label: "Размер подписи",
    hint: "Текст и плашка меняются вместе. Размер здания остаётся прежним.",
    reset: "Сбросить",
    unit: "пкс",
  },
  en: {
    label: "Label size",
    hint: "Text and plaque scale together. The building size stays the same.",
    reset: "Reset",
    unit: "px",
  },
};

/** Pure field shared by the real asset editor and the isolated preview. */
export function LabelSizeControl({
  value,
  onChange,
  lang = "ru",
  disabled = false,
}: {
  value: number;
  onChange: (size: number) => void;
  lang?: "ru" | "en";
  disabled?: boolean;
}) {
  const id = useId();
  const t = copy[lang];
  const size = castleLabelSize(value);
  return (
    <div className="space-y-1 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm">
          {t.label}
        </label>
        <output htmlFor={id} className="text-sm tabular-nums">
          {size} {t.unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={LABEL_SIZE_MIN}
        max={LABEL_SIZE_MAX}
        step={1}
        value={size}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        className="block h-11 w-full accent-[#9d8859] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40"
      />
      <div className="flex items-center gap-3">
        <p id={`${id}-hint`} className="flex-1 text-xs text-muted-foreground">
          {t.hint}
        </p>
        <button
          type="button"
          onClick={() => onChange(LABEL_SIZE_DEFAULT)}
          disabled={disabled || size === LABEL_SIZE_DEFAULT}
          className="min-h-11 rounded border border-border px-3 text-xs disabled:opacity-40"
        >
          {t.reset}
        </button>
      </div>
    </div>
  );
}
