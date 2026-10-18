// Настройка алтаря-БУСТА: что даёт герою и сколько просит за подход.
//
// Сами эффекты рисует общий редактор (BoostEffectsEditor) — он же стоит в
// карточке своего товара, чтобы правило «одно поле на диапазон» жило в одном
// месте. Здесь — только цена подхода, тем же редактором строк, что у портала.
//
// Своей кнопки «Сохранить» у алтаря нет: правка сразу ложится в клетку
// (редактор карт) или в очередь выгрузки (режим бога). Поэтому «Забвение» с
// неверной парой «уровень + минуты» остаётся только в форме — со строкой ошибки
// под эффектом — и в клетку не уходит, пока его не поправят (oblivionRule.ts).
import { useState } from "react";
import { Dumbbell } from "lucide-react";
import type { BoostCellConfig } from "@/lib/boostConfig";
import { oblivionEffectsOk } from "@/lib/hero/oblivionRule";
import { BoostEffectsEditor } from "@/components/beta-raid/market/BoostEffectsEditor";
import { PortalPricesEditor } from "./PortalPricesEditor";

export function BoostConfigEditor({
  config,
  tokens,
  onChange,
}: {
  config: BoostCellConfig;
  tokens: string[];
  onChange: (next: BoostCellConfig) => void;
}) {
  const [draft, setDraft] = useState<BoostCellConfig | null>(null);
  const value = draft ?? config;
  const put = (next: BoostCellConfig) => {
    setDraft(next);
    if (oblivionEffectsOk(next.effects)) onChange(next);
  };

  return (
    <div className="mb-3 rounded-xl border border-border/60 bg-secondary/20 p-2.5">
      <p className="mb-2 flex items-center justify-center gap-1 text-center text-[11px] text-gold">
        <Dumbbell className="h-3 w-3" />
        БУСТ ЭТОЙ клетки · применится после «Сохранить» карты
      </p>

      <BoostEffectsEditor
        effects={value.effects}
        onChange={(effects) => put({ ...value, effects })}
      />

      <div className="mt-2">
        <PortalPricesEditor
          prices={value.prices}
          tokens={tokens}
          onChange={(prices) => put({ ...value, prices })}
          title="Цена одного подхода"
        />
        {value.prices.length === 0 && (
          <p className="text-[10px] text-muted-foreground">
            Цены нет — буст выдаётся бесплатно и сколько угодно раз.
          </p>
        )}
      </div>
    </div>
  );
}
