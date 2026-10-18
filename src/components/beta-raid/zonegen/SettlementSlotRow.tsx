// Строка состава: галочка · имя · поведение · сколько штук · фон.
//
// Бейдж поведения тут не украшение: в справочнике две «Ратуши», две «Ворота» и
// три «Бара» — имена совпадают, и отличает их только эффект. Без бейджа админ
// выбирает вслепую и потом удивляется, почему ратуша не работает как ратуша.
//
// «!» — постройке нужен свой building_config (шахта, поле, портал): генератор
// поставит её ПУСТОЙ, и в игре она скажет «не настроена».
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { MAX_COUNT, effectKey, type SettlementSlot } from "./settlementSlots";

const NUM =
  "w-11 shrink-0 rounded border border-border bg-secondary/40 px-1 py-0.5 text-right text-[10px] tabular-nums text-foreground";
const FILL_ON = "border-gold/60 bg-gold/20 text-gold";
const FILL_OFF = "border-border bg-secondary/40 text-muted-foreground";

export function SettlementSlotRow({
  building,
  slot,
  onToggle,
  onCount,
  onFill,
}: {
  building: BuildingOption;
  /** Нет строки — постройка в состав не входит. */
  slot: SettlementSlot | undefined;
  onToggle: (on: boolean) => void;
  onCount: (count: number) => void;
  onFill: (fill: boolean) => void;
}) {
  const t = useT();
  const effect = t(effectKey(building.effect));

  return (
    <div className="flex items-center gap-1 py-0.5">
      <input
        type="checkbox"
        checked={!!slot}
        onChange={(e) => onToggle(e.target.checked)}
        className="shrink-0 accent-gold"
      />
      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{building.name}</span>
      <span
        title={t("zonegen.set_effect_of", { name: effect })}
        className="max-w-[68px] shrink-0 truncate rounded bg-secondary/50 px-1 text-[9px] text-muted-foreground"
      >
        {effect}
      </span>
      {building.needsConfig && (
        // svg своим title тултип не показывает — вешаем на обёртку.
        <span title={t("zonegen.needs_config")} className="shrink-0">
          <AlertTriangle className="h-3 w-3 text-amber-300" />
        </span>
      )}
      {slot && (
        <>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_COUNT}
            step={1}
            value={slot.count}
            onChange={(e) => onCount(Number(e.target.value))}
            title={t("zonegen.set_pcs_title")}
            aria-label={t("zonegen.set_pcs_title")}
            className={NUM}
          />
          <button
            type="button"
            onClick={() => onFill(!slot.fill)}
            aria-pressed={!!slot.fill}
            title={t("zonegen.set_fill_title")}
            className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold ${
              slot.fill ? FILL_ON : FILL_OFF
            }`}
          >
            {t("zonegen.set_fill")}
          </button>
        </>
      )}
    </div>
  );
}
