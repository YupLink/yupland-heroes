// Плавающая панель управления биом-генератором.
//
// Появляется, когда в редакторе есть хотя бы одна клетка в selectedForGen.
// Сама панель ничего не считает — только собирает выбор (какой биом, для
// custom — какой terrainId) и зовёт колбэки. Генерация и применение к
// клеткам живут в hex-editor: там доступны cells, applyPatches и preview-
// буфер, а панель остаётся тонким UI-модулем ≤250 строк.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, RefreshCw, Check, X } from "lucide-react";
import type { BiomeType } from "@/lib/biomeGenerators";
import type { TerrainDef } from "@/components/admin/hex-editor/hexShared";

const BIOMES: Array<{ id: BiomeType; label: string }> = [
  { id: "island", label: "Остров" },
  { id: "forest", label: "Лес" },
  { id: "desert", label: "Пустыня" },
  { id: "plain", label: "Равнина" },
  { id: "custom", label: "Кастом" },
];

export function BiomeGenPanel({
  count,
  hasPreview,
  terrains,
  onGenerate,
  onApply,
  onReset,
}: {
  /** Сколько клеток в selectedForGen (для счётчика). */
  count: number;
  /** Есть ли в preview-буфере хоть один патч — от этого зависит текст кнопки. */
  hasPreview: boolean;
  /** Список типов местности для селектора кастомного биома. */
  terrains: TerrainDef[];
  /**
   * Запуск генератора. Panel не различает «Сгенерировать» и
   * «Перегенерировать»: оба зовут этот колбэк — hex-editor каждый раз
   * заменяет буфер новым результатом. Сам генератор внутри тянет
   * Math.random, так что два подряд запуска дадут разные картинки.
   */
  onGenerate: (biome: BiomeType, customTerrainId: string | null) => void;
  /** Перенос preview-буфера в основную очередь правок (applyPatches). */
  onApply: () => void;
  /** Очистка preview-буфера и selectedForGen без применения. */
  onReset: () => void;
}) {
  const [biome, setBiome] = useState<BiomeType>("island");
  // customTerrainId — только для biome = custom. Первое значение подставим
  // из справочника, чтобы «Сгенерировать» не молчал на первом клике.
  const [customTerrainId, setCustomTerrainId] = useState<string>(() => terrains[0]?.id ?? "");

  const disabledGen = biome === "custom" && !customTerrainId;

  return (
    <div
      // Position: снизу по центру канваса, поверх подсказки. Backdrop-blur —
      // чтобы карта под ним не сбивала чтение цифры и лейблов.
      className="pointer-events-auto absolute bottom-10 left-1/2 z-40 flex -translate-x-1/2 flex-col gap-1.5 rounded-xl border border-gold/40 bg-black/80 p-2 text-xs shadow-2xl backdrop-blur"
      // Клики по панели не должны валиться в native-обработчик карты,
      // иначе первый же тап по кнопке ставил бы клетке местность.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-gold" />
        <b className="text-gold">Биом-генератор</b>
        <span className="ml-auto rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold tabular-nums">
          {count} кл.
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <select
          value={biome}
          onChange={(e) => setBiome(e.target.value as BiomeType)}
          className="rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground"
        >
          {BIOMES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        {/* Селектор terrainId — только для «Кастом». Иначе поле забирает
            место и создаёт впечатление, что оно на что-то влияет. */}
        {biome === "custom" && (
          <select
            value={customTerrainId}
            onChange={(e) => setCustomTerrainId(e.target.value)}
            className="min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground"
          >
            {terrains.length === 0 && <option value="">нет типов местности</option>}
            {terrains.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onGenerate(biome, biome === "custom" ? customTerrainId : null)}
          disabled={disabledGen}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-300 transition disabled:opacity-40",
            hasPreview ? "hidden" : "flex",
          )}
          title="Заполнить preview для выделения"
        >
          <Sparkles className="h-3 w-3" /> Сгенерировать
        </button>
        <button
          onClick={() => onGenerate(biome, biome === "custom" ? customTerrainId : null)}
          disabled={disabledGen}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg bg-sky-500/15 px-2 py-1 text-[11px] font-bold text-sky-300 transition disabled:opacity-40",
            hasPreview ? "flex" : "hidden",
          )}
          title="Перегенерировать: буфер заменяется новым вариантом"
        >
          <RefreshCw className="h-3 w-3" /> Перегенерировать
        </button>
        <button
          onClick={onApply}
          disabled={!hasPreview}
          className="inline-flex items-center gap-1 rounded-lg bg-gold/20 px-2 py-1 text-[11px] font-bold text-gold transition disabled:opacity-40"
          title="Перенести preview в очередь правок редактора"
        >
          <Check className="h-3 w-3" /> Применить
        </button>
        <button
          onClick={onReset}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-bold text-rose-300 transition"
          title="Сбросить выделение и preview"
        >
          <X className="h-3 w-3" /> Сбросить
        </button>
      </div>
    </div>
  );
}
