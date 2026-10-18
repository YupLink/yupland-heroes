// Слои рецепта зоны: местность + вес в процентах, удаление, «+ слой».
//
// Веса — не строгие проценты: сервер нормирует их по сумме (normalizeWeights),
// так что «60 и 20» читается как 75/25. Поэтому не заставляем сумму сходиться
// к 100 и не пересчитываем соседей при правке одного поля.
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ZoneLayer } from "@/lib/raid/zonegen/recipe";
import { clampNum, nextLayer } from "./zoneGenHelpers";

/** Справочнику местностей панели хватает id + имени. */
export type TerrainOption = { id: string; name: string };

/** Схема как у zoneRecipeSchema: не больше 12 слоёв. */
const MAX_LAYERS = 12;

export function ZoneGenLayers({
  layers,
  terrains,
  onChange,
}: {
  layers: ZoneLayer[];
  terrains: TerrainOption[];
  onChange: (layers: ZoneLayer[]) => void;
}) {
  const t = useT();
  const ids = terrains.map((o) => o.id);

  const update = (at: number, part: Partial<ZoneLayer>) =>
    onChange(layers.map((l, i) => (i === at ? { ...l, ...part } : l)));
  const remove = (at: number) => {
    // Последний слой не убираем: рецепт без местностей сервер отобьёт по схеме.
    if (layers.length <= 1) return;
    onChange(layers.filter((_, i) => i !== at));
  };
  const add = () => {
    const extra = nextLayer(ids, layers);
    if (extra && layers.length < MAX_LAYERS) onChange([...layers, extra]);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("zonegen.layers")}
        </span>
        <button
          type="button"
          onClick={add}
          disabled={ids.length === 0 || layers.length >= MAX_LAYERS}
          className="ml-auto rounded-lg bg-secondary/40 px-2 py-0.5 text-[11px] font-semibold text-foreground disabled:opacity-40"
        >
          {t("zonegen.add_layer")}
        </button>
      </div>
      {layers.map((layer, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            value={layer.terrainId}
            onChange={(e) => update(i, { terrainId: e.target.value })}
            className="min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground"
          >
            {ids.length === 0 && <option value="">{t("zonegen.no_terrains")}</option>}
            {terrains.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={layer.weight}
            onChange={(e) => update(i, { weight: clampNum(e.target.value, 0, 100) })}
            title={t("zonegen.weight_pct")}
            className="w-14 rounded border border-border bg-secondary/40 px-1.5 py-1 text-right text-[11px] tabular-nums text-foreground"
          />
          <span className="text-[10px] text-muted-foreground">%</span>
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={layers.length <= 1}
            title={t("zonegen.remove_layer")}
            className="rounded-lg p-1 text-muted-foreground disabled:opacity-30"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
