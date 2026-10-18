// Распределение фонда по местам: пресеты + тонкая настройка процентов.
// Вынесено из RewardConfigEditor.tsx без изменений — тот перерос лимит файла.
import { useState } from "react";
import { ChevronDown, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  activePreset,
  clampNum,
  DEFAULT_SPLIT,
  genFlat,
  genSplit,
  TOP20,
  type DraftConfig,
} from "./rewardDraft";

export function RewardSplitEditor({
  cfg,
  setCfg,
}: {
  cfg: DraftConfig;
  setCfg: (patch: Partial<DraftConfig>) => void;
}) {
  const [fine, setFine] = useState(false);
  const setSplit = (i: number, val: string) =>
    setCfg({ split: cfg.split.map((s, j) => (j === i ? val : s)) });

  const splitSum = cfg.split.reduce((s, x) => s + (Number(x) || 0), 0);
  const norm = (pct: string | number) => (splitSum > 0 ? (Number(pct) || 0) / splitSum : 0);
  const preset = activePreset(cfg.split);
  const places = cfg.split.length;

  const presetBtn = (id: string, label: string, split: string[]) => (
    <button
      type="button"
      onClick={() => setCfg({ split })}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-medium transition",
        preset === id
          ? "gradient-gold text-gold-foreground"
          : "border border-border bg-secondary/40 text-muted-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">Кому достаётся</span>
      <div className="flex flex-wrap gap-2">
        {presetBtn("win", "Только 1-е", ["100"])}
        {presetBtn("top3", "Топ-3", ["50", "30", "20"])}
        {presetBtn("top10", "Топ-10", DEFAULT_SPLIT.map(String))}
        {presetBtn("top20", "Топ-20", TOP20.map(String))}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {preset
          ? `Награду делят ${places} ${places === 1 ? "место" : "мест"} · 1-е — ${
              Math.round(norm(cfg.split[0]) * 1000) / 10
            }%`
          : `Своё распределение: ${places} мест`}
      </div>

      <button
        type="button"
        onClick={() => setFine((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Тонкая настройка процентов
        <ChevronDown className={cn("h-3.5 w-3.5 transition", fine && "rotate-180")} />
      </button>

      {fine && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">% по местам</span>
            <span className={splitSum === 100 ? "text-success" : "text-amber-500"}>
              сумма {Math.round(splitSum * 10) / 10}%
              {splitSum !== 100 ? " · нормализуется к 100" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {cfg.split.map((pct, i) => (
              <div key={i} className="flex items-center gap-1 text-xs">
                <span className="w-10 shrink-0 text-muted-foreground">{i + 1}-е</span>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={pct}
                  onChange={(e) => setSplit(i, e.target.value)}
                  onBlur={() =>
                    setSplit(i, String(clampNum(pct, 0, Number.MAX_SAFE_INTEGER, false)))
                  }
                  className="w-14 rounded border border-border bg-background px-1.5 py-1.5 text-base"
                />
                <span className="text-muted-foreground">
                  → {Math.round(norm(pct) * 1000) / 10}%
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCfg({ split: [...cfg.split, "0"] })}
              className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-gold"
            >
              <Plus className="h-3 w-3" /> место
            </button>
            {cfg.split.length > 1 && (
              <button
                type="button"
                onClick={() => setCfg({ split: cfg.split.slice(0, -1) })}
                className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-muted-foreground"
              >
                <Trash2 className="h-3 w-3" /> убрать
              </button>
            )}
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => setCfg({ split: genSplit(30) })}
              className="text-muted-foreground hover:text-gold"
            >
              Топ-30
            </button>
            <button
              type="button"
              onClick={() => setCfg({ split: genSplit(50) })}
              className="text-muted-foreground hover:text-gold"
            >
              Топ-50
            </button>
            <button
              type="button"
              onClick={() => setCfg({ split: genFlat(cfg.split.length) })}
              className="text-muted-foreground hover:text-gold"
            >
              Поровну
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
