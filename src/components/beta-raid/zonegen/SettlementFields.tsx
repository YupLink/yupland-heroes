// Размерные ручки поселения: сколько, какого поперечника, насколько плотно и
// по какой дороге. Вынесено из SettlementBlock (правило ≤250 строк): там
// остались тип, планировка, состав и шаблоны, здесь — четыре поля.
//
// При живом росте поперечник и плотность прячутся: их выводит число построек
// (радиус по A(R)·ρ(N) ≥ N и плотность по закону Кларка — шаги 2 и 7
// docs/town-generation-algorithm.json), а ручка, которая ни на что не влияет,
// хуже её отсутствия.
import { useT } from "@/lib/i18n";
import type { SettlementRecipe } from "@/lib/raid/zonegen/settlement-types";
import { derivesShape } from "./settlementAuto";
import type { ZoneRoadOption } from "./useZoneBuildings";
import { clampNum } from "./zoneGenHelpers";

const FIELD =
  "w-14 rounded border border-border bg-secondary/40 px-1.5 py-1 text-right text-[11px] tabular-nums text-foreground";
const SELECT =
  "min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground";
const LABEL = "w-24 shrink-0 text-[10px] text-muted-foreground";

export function SettlementFields({
  settlement,
  roads,
  onPatch,
}: {
  settlement: SettlementRecipe;
  roads: ZoneRoadOption[];
  onPatch: (part: Partial<SettlementRecipe>) => void;
}) {
  const t = useT();
  const shape = !derivesShape(settlement.layout);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {t("zonegen.set_count")}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={settlement.count}
            onChange={(e) => onPatch({ count: Math.round(clampNum(e.target.value, 1, 12)) })}
            className={FIELD}
          />
        </label>
        {shape && (
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {t("zonegen.set_size")}
            <input
              type="number"
              inputMode="numeric"
              min={2}
              max={25}
              value={settlement.size}
              onChange={(e) => onPatch({ size: Math.round(clampNum(e.target.value, 2, 25)) })}
              className={FIELD}
            />
          </label>
        )}
      </div>

      {shape && (
        <label className="flex items-center gap-2">
          <span className={LABEL}>{t("zonegen.set_density")}</span>
          <input
            type="range"
            min={0.05}
            max={0.8}
            step={0.05}
            value={settlement.density}
            onChange={(e) => onPatch({ density: clampNum(e.target.value, 0.05, 0.8) })}
            className="range-gold min-w-0 flex-1"
          />
          <span className="w-8 text-right text-[11px] tabular-nums">
            {Math.round(settlement.density * 100)}%
          </span>
        </label>
      )}

      <label className="flex items-center gap-2">
        <span className={LABEL}>{t("zonegen.set_road")}</span>
        <select
          value={settlement.roadId ?? ""}
          onChange={(e) => onPatch({ roadId: e.target.value || null })}
          className={SELECT}
        >
          <option value="">{t("zonegen.set_road_none")}</option>
          {roads.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
