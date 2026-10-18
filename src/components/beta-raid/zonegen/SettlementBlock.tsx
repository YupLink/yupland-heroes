// Поселения в рецепте зоны: как строить, из чего, сколько и с какой дорогой.
//
// Владелец 22.09.2026: «нужно чтобы была возможность генерировать и города из
// уже имеющихся предзагруженных моделек построек». Генератор ничего не рисует
// заново — он расставляет шаблоны из справочника и связывает их дорогой.
//
// 25.09.2026 — «чтобы ты рандомно делал подборки… чтобы был АЛГОРИТМ, а не
// придуманный паттерн»: по умолчанию живой рост с автоподбором (число построек
// и тема вместо списка), ручной состав — по тумблеру или у трафаретов.
//
// Блок выключен по умолчанию и свёрнут: обычная зона — это местность с
// декором, поселения нужны не каждый раз, а панель и так живёт поверх карты
// на 360 px. Справочник построек запрашивается только когда блок включили.
import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import type { SettlementRecipe } from "@/lib/raid/zonegen/settlement-types";
import { SettlementAutoPick } from "./SettlementAutoPick";
import { SettlementBuildings } from "./SettlementBuildings";
import { SettlementFields } from "./SettlementFields";
import { SettlementFlags } from "./SettlementFlags";
import { SettlementLayoutPick } from "./SettlementLayoutPick";
import { SettlementPresetPick } from "./SettlementPresetPick";
import { TownBlueprintBar } from "./TownBlueprintBar";
import { usesManualSet } from "./settlementAuto";
import { activeSlots } from "./settlementSlots";
import { useZoneBuildings } from "./useZoneBuildings";

export function SettlementBlock({
  settlement,
  onPatch,
  onApplied,
  onReroll,
  rerollDisabled,
}: {
  settlement: SettlementRecipe;
  /** Частичная правка блока поселений внутри рецепта зоны. */
  onPatch: (part: Partial<SettlementRecipe>) => void;
  /** Шаблон перенесён в рецепт — панель подсвечивает «Сгенерировать». */
  onApplied?: () => void;
  /** «Другая подборка»: новый сид и сразу генерация. */
  onReroll: () => void;
  rerollDisabled: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Справочник тянем только для включённого блока: выключенным он не нужен.
  const catalog = useZoneBuildings(settlement.enabled);
  const buildings = catalog.data?.buildings ?? [];
  const roads = catalog.data?.roads ?? [];
  const shown = settlement.enabled && open;
  const manual = usesManualSet(settlement);

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/10 p-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
          <input
            type="checkbox"
            checked={settlement.enabled}
            onChange={(e) => {
              onPatch({ enabled: e.target.checked });
              if (e.target.checked) setOpen(true);
            }}
            className="accent-gold"
          />
          {t("zonegen.settlement")}
        </label>
        {catalog.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!settlement.enabled}
          className="ml-auto rounded-md bg-secondary/40 p-1 text-muted-foreground disabled:opacity-40"
        >
          {shown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {shown && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <SettlementLayoutPick
            layout={settlement.layout}
            onLayout={(layout) => onPatch({ layout })}
          />

          <TownBlueprintBar
            settlement={settlement}
            onApply={(part) => {
              onPatch(part);
              onApplied?.();
            }}
          />

          {/* Тумблер только у живого роста: трафареты собирают город из
              списка, подбирать им нечего. */}
          {settlement.layout === "organic" && (
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={settlement.auto}
                onChange={(e) => onPatch({ auto: e.target.checked })}
                className="accent-gold"
              />
              {t("zonegen.set_auto")}
            </label>
          )}

          {manual ? (
            <SettlementPresetPick settlement={settlement} buildings={buildings} onPatch={onPatch} />
          ) : (
            <SettlementAutoPick
              buildings={settlement.buildings}
              theme={settlement.theme}
              kind={settlement.kind}
              onPatch={onPatch}
              onReroll={onReroll}
              rerollDisabled={rerollDisabled}
            />
          )}

          <SettlementFields settlement={settlement} roads={roads} onPatch={onPatch} />

          <SettlementFlags built={settlement.built} onBuilt={(built) => onPatch({ built })} />

          {/* Ошибку справочника показываем и при автоподборе: из него же
              приходят дороги, и пустой селект дороги иначе был бы загадкой. */}
          {catalog.error ? (
            <p className="text-[10px] text-rose-300">{humanError(catalog.error)}</p>
          ) : (
            manual && (
              <SettlementBuildings
                buildings={buildings}
                slots={settlement.slots}
                onSlots={(slots) => onPatch({ slots })}
                query={query}
                onQuery={setQuery}
              />
            )
          )}
          {/* Пустой состав — самая частая причина «сгенерировал, а домов нет».
              Строка без «шт» и без фона считается тем же пустым составом. При
              автоподборе список не нужен — и предупреждать не о чем. */}
          {manual && activeSlots(settlement.slots) === 0 && !catalog.isLoading && (
            <p className="text-[10px] text-amber-300">{t("zonegen.set_none_picked")}</p>
          )}
        </div>
      )}
    </div>
  );
}
