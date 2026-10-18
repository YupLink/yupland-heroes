// Панель зоны в режиме бога: рецепт (слои, масштаб, декор, сид), ИИ-подсказка,
// запуск генератора и отчёт. Тело для BiomeGenPanelLive в режиме «Зона» —
// обёртка (fixed, шапка, счётчик) остаётся там.
//
// Сама генерация на сервере: он один знает опыт карты (какой декор где стоял)
// и кладёт пятна по сиду, так что соседние зоны сходятся швами сами. Сюда
// приходят патчи, и они ложатся в очередь кисти одной пачкой (queueCells).
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Shuffle, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { CellPatch } from "@/lib/raid/mapDelta";
import { useAssets } from "../AdminCellPalette";
import { ZoneGenLayers } from "./ZoneGenLayers";
import { ZoneGenSettings } from "./ZoneGenSettings";
import { ZoneGenAi } from "./ZoneGenAi";
import { SettlementBlock } from "./SettlementBlock";
import { ZoneGenReport } from "./ZoneGenReport";
import { useZoneGen } from "./useZoneGen";

const BTN =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:opacity-40";

export function ZoneGenPanel({
  count,
  selectedForGen,
  queueCells,
  discardKeys,
  onResetSelection,
  compact = false,
  onGenerated,
}: {
  /** Сколько клеток выделено (счётчик в шапке рисует обёртка, здесь — для ИИ). */
  count: number;
  /**
   * Свёрнутая панель: только «Сгенерировать/Перегенерировать» и строка отчёта —
   * рецепт и состояние живут дальше, компонент не размонтируется.
   */
  compact?: boolean;
  /** Генерация легла в очередь — обёртка сворачивает панель, чтобы видеть карту. */
  onGenerated?: () => void;
  /** Клетки зоны — Set ключей «q,r». */
  selectedForGen: Set<string>;
  /** Пачка правок в очередь кисти одним коммитом. */
  queueCells: (patches: CellPatch[]) => void;
  /** Снять с очереди правки по ключам. */
  discardKeys: (keys: string[]) => void;
  /** Просто очистить выделение: правки в очереди остаются. */
  onResetSelection: () => void;
}) {
  const t = useT();
  const assets = useAssets("terrain");
  // Справочник палитры, без сентинелов купола/города — те не местность.
  const terrains = useMemo(
    () => (assets.data ?? []).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
    [assets.data],
  );
  const terrainIds = useMemo(() => terrains.map((o) => o.id), [terrains]);
  const names = useMemo(() => new Map(terrains.map((o) => [o.id, o.name])), [terrains]);

  const gen = useZoneGen({ selectedForGen, terrainIds, queueCells, discardKeys });
  const noTerrain = gen.recipe.layers.some((l) => !l.terrainId);
  const cannot = gen.busy || noTerrain || count === 0;
  // Шаблон перенесён в рецепт, но на карте его ещё нет: сразу строить не
  // надо (админ может подкрутить число и тему), а «Сгенерировать» обведено
  // золотом, как активная кнопка, — следующий шаг виден без подписи. Гаснет
  // только по удачному прогону: отказ («выдели клетки») шаг не закрывает.
  const [nudge, setNudge] = useState(false);

  // Новый отчёт = прогон удался: сообщаем наверх ровно раз на прогон.
  const lastReport = useRef(gen.report);
  useEffect(() => {
    if (gen.report && gen.report !== lastReport.current) {
      setNudge(false);
      onGenerated?.();
    }
    lastReport.current = gen.report;
  }, [gen.report, onGenerated]);

  const runButtons = (
    <>
      <button
        type="button"
        onClick={gen.generate}
        disabled={cannot}
        className={cn(BTN, "bg-emerald-500/15 text-emerald-300", nudge && "ring-1 ring-gold")}
      >
        {gen.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {gen.busy ? t("zonegen.busy") : t("zonegen.generate")}
      </button>
      <button
        type="button"
        onClick={gen.regenerate}
        disabled={cannot}
        title={t("zonegen.seed_roll")}
        className={cn(BTN, "bg-emerald-500/15 text-emerald-300")}
      >
        <RefreshCw className="h-3 w-3" /> {t("zonegen.regenerate")}
      </button>
    </>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1">{runButtons}</div>
        {gen.error && <p className="text-[10px] text-rose-300">{gen.error}</p>}
        {gen.report && <ZoneGenReport report={gen.report} names={names} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ZoneGenLayers
        layers={gen.recipe.layers}
        terrains={terrains}
        onChange={(layers) => gen.patch({ layers })}
      />
      <ZoneGenSettings recipe={gen.recipe} onPatch={gen.patch} />
      {/* Поселения — тем же рецептом и тем же сидом: постройки из справочника
          ложатся поверх только что нарисованной местности. */}
      <SettlementBlock
        settlement={gen.recipe.settlement}
        onPatch={gen.patchSettlement}
        onApplied={() => setNudge(true)}
        onReroll={gen.regenerate}
        rerollDisabled={cannot}
      />
      <ZoneGenAi cellCount={count} disabled={gen.busy || count === 0} onRecipe={gen.applyAi} />

      <div className="flex flex-wrap items-center gap-1">
        {runButtons}
        <button
          type="button"
          onClick={gen.random}
          disabled={gen.busy || terrainIds.length === 0}
          className={cn(BTN, "bg-secondary/40 font-semibold text-foreground")}
        >
          <Shuffle className="h-3 w-3" /> {t("zonegen.random_recipe")}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={gen.discard}
          disabled={gen.busy}
          title={t("zonegen.discard_title")}
          className={cn(BTN, "bg-rose-500/15 text-rose-300")}
        >
          <Trash2 className="h-3 w-3" /> {t("zonegen.discard")}
        </button>
        <button
          type="button"
          onClick={() => {
            // Сброс — это «начинаем заново»: вместе с выделением забываем и
            // город прошлой генерации, иначе следующий прогон снимал бы дома,
            // которые админ мог уже выгрузить.
            gen.forgetPlaced();
            onResetSelection();
          }}
          title={t("zonegen.reset_title")}
          className={cn(BTN, "ml-auto bg-secondary/40 font-semibold text-muted-foreground")}
        >
          <X className="h-3 w-3" /> {t("zonegen.reset")}
        </button>
      </div>

      {gen.error && <p className="text-[10px] text-rose-300">{gen.error}</p>}
      {gen.report && <ZoneGenReport report={gen.report} names={names} />}
      <p className="text-[10px] text-muted-foreground">
        <Check className="mr-0.5 inline h-2.5 w-2.5" />
        {t("zonegen.hint_queue")}
      </p>
    </div>
  );
}
