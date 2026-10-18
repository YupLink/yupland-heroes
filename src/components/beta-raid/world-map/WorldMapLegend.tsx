// Легенда карты мира: значок + название (+ сколько на карте). Сверху своё —
// герой, замок, клады; ниже постройки — каждое поведение своей строкой и
// «Все постройки» разом. Тап включает и выключает вид, выключенный приглушён.
// Строки — только у того, что есть в ответе. Ниже местность — от самой частой
// к редкой и только та, что есть на этой карте; она не выключается.
//
// На телефоне легенда — не выше половины экрана со своей прокруткой, на ПК —
// во всю высоту карты.
import { useMemo, type ReactNode } from "react";
import { Building2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { paletteCss } from "./terrainColors";
import { BUILDING_LAYERS, countMarks, type WorldLayer } from "./worldMapLayers";
import { WorldMapLegendIcon } from "./WorldMapLegendIcon";
import type { WorldMapModel } from "./worldMapModel";
import type { TerrainPalette } from "./useTerrainPalette";

function Row({
  icon,
  label,
  count,
  on,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-8 w-full items-center gap-2 rounded-md px-1 text-left transition-opacity",
        !on && "opacity-40",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-foreground/90">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

export function WorldMapLegend({
  model,
  palette,
  hidden,
  onToggle,
  onToggleAll,
}: {
  model: WorldMapModel;
  palette: TerrainPalette | null;
  /** Выключенные виды меток. */
  hidden: ReadonlySet<WorldLayer>;
  onToggle: (layer: WorldLayer) => void;
  /** «Все постройки»: anyOn — видна ли сейчас хоть одна. */
  onToggleAll: (anyOn: boolean) => void;
}) {
  const t = useT();
  const lang = useLang();
  const counts = useMemo(() => countMarks(model.marks), [model.marks]);
  const buildings = BUILDING_LAYERS.filter((k) => (counts.get(k) ?? 0) > 0);
  const anyOn = buildings.some((k) => !hidden.has(k));
  const treasures = counts.get("treasure") ?? 0;
  const own: WorldLayer[] = treasures > 0 ? ["hero", "castle", "treasure"] : ["hero", "castle"];
  const terrains = model.terrains
    .map((tr, i) => ({ tr, v: i + 1, n: model.counts[i + 1] ?? 0 }))
    .filter((x) => x.n > 0 && x.tr.name)
    .sort((a, b) => b.n - a.n);
  const colors = palette?.terrains === model.terrains ? palette.bytes : null;
  const layerRow = (layer: WorldLayer, count?: number) => (
    <Row
      key={layer}
      icon={<WorldMapLegendIcon layer={layer} />}
      label={t(`wmap.${layer}`)}
      count={count}
      on={!hidden.has(layer)}
      onClick={() => onToggle(layer)}
    />
  );
  return (
    <div className="absolute bottom-2 left-2 max-h-[45%] w-44 touch-pan-y overflow-y-auto overscroll-contain rounded-xl border border-border bg-black/80 p-2 text-xs sm:max-h-[calc(100%-1rem)] sm:w-48">
      {own.map((layer) => layerRow(layer, layer === "treasure" ? treasures : undefined))}
      {buildings.length > 0 && (
        <>
          <div className="my-1.5 border-t border-border" />
          <Row
            icon={<Building2 className="h-3.5 w-3.5 shrink-0 text-foreground/90" />}
            label={t("wmap.buildings")}
            on={anyOn}
            onClick={() => onToggleAll(anyOn)}
          />
          {buildings.map((k) => layerRow(k, counts.get(k)))}
        </>
      )}
      {terrains.length > 0 && <div className="my-1.5 border-t border-border" />}
      {terrains.map(({ tr, v }) => (
        <div key={tr.id} className="flex min-h-6 items-center gap-2 px-1">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/60"
            style={colors ? { background: paletteCss(colors, v) } : undefined}
          />
          <span className="truncate text-foreground/90">{localizeAssetName(tr.name, lang)}</span>
        </div>
      ))}
    </div>
  );
}
