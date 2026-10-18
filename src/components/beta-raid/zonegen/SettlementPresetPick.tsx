// Тип поселения и сборка ручного состава под него.
//
// Вынесено из SettlementBlock (правило ≤250 строк), когда там появились живой
// рост и автоподбор. Живёт только при ручном составе: при автоподборе тип
// выводится из числа построек и въездов (лагерь, хутор, деревня, городок,
// порт — docs/town-generation-algorithm.json, шаг 3), и выбирать его руками
// значило бы спорить с алгоритмом.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import {
  PRESET_SHAPE,
  SETTLEMENT_PRESETS,
  type BuildingOption,
  type SettlementPreset,
  type SettlementRecipe,
} from "@/lib/raid/zonegen/settlement-types";
import { SettlementCompose } from "./SettlementCompose";
import { applyCompose } from "./settlementSlots";

const SELECT =
  "min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground";
const LABEL = "w-24 shrink-0 text-[10px] text-muted-foreground";

export function SettlementPresetPick({
  settlement,
  buildings,
  onPatch,
}: {
  settlement: SettlementRecipe;
  buildings: BuildingOption[];
  onPatch: (part: Partial<SettlementRecipe>) => void;
}) {
  const t = useT();
  // Тип сменили при непустом составе: молча перетряхивать чужой выбор нельзя,
  // поэтому предлагаем пересобрать отдельной кнопкой.
  const [offer, setOffer] = useState(false);

  const compose = (preset: SettlementPreset) => {
    onPatch({ slots: applyCompose(preset, buildings) });
    setOffer(false);
  };

  const changePreset = (preset: SettlementPreset) => {
    // Пресет — это рамка размера и плотности: меняем их заодно, иначе «порт»
    // отличался бы от «лагеря» только словом. Пустой состав собираем сразу:
    // выбрал тип — увидел, из чего он состоит.
    const empty = settlement.slots.length === 0;
    const slots = empty ? applyCompose(preset, buildings) : settlement.slots;
    onPatch({ preset, ...PRESET_SHAPE[preset], slots });
    setOffer(!empty);
  };

  return (
    <>
      <label className="flex items-center gap-2">
        <span className={LABEL}>{t("zonegen.preset")}</span>
        <select
          value={settlement.preset}
          onChange={(e) => changePreset(e.target.value as SettlementPreset)}
          className={SELECT}
        >
          {SETTLEMENT_PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`zonegen.preset_${p}`)}
            </option>
          ))}
        </select>
      </label>
      <SettlementCompose
        preset={settlement.preset}
        disabled={buildings.length === 0}
        offer={offer}
        onCompose={() => compose(settlement.preset)}
        onClear={() => {
          onPatch({ slots: [] });
          setOffer(false);
        }}
      />
    </>
  );
}
