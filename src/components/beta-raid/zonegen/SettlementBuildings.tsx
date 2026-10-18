// Состав поселения: какие постройки ставим, по сколько штук и чем добиваем.
//
// Шаблонов под сотню, поэтому список свой прокручиваемый (max-h-40) и с
// поиском: иначе блок поселений занял бы весь экран телефона. Группы — по
// поведению постройки («маркет», «таверна», «просто дом»), так набор виден
// целиком, а не простынёй имён.
//
// Два числа в шапке отвечают на вопрос владельца «почему выбирается так
// много»: обязательных — это сумма «шт», ровно столько построек встанет в
// каждом поселении; фон — сколько шаблонов пойдёт на остаток пятна.
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { SettlementSlotRow } from "./SettlementSlotRow";
import {
  DEFAULT_COUNT,
  MAX_SLOTS,
  countTotal,
  dropSlot,
  effectKey,
  fillCount,
  groupByEffect,
  matchBuilding,
  setCount,
  setFill,
  slotFor,
  type SettlementSlot,
} from "./settlementSlots";

export function SettlementBuildings({
  buildings,
  slots,
  onSlots,
  query,
  onQuery,
}: {
  buildings: BuildingOption[];
  slots: SettlementSlot[];
  onSlots: (slots: SettlementSlot[]) => void;
  /** Строка поиска живёт выше: список пересобирается, а ввод не теряется. */
  query: string;
  onQuery: (query: string) => void;
}) {
  const t = useT();
  const groups = groupByEffect(buildings.filter((b) => matchBuilding(b, query)));
  const full = slots.length >= MAX_SLOTS;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("zonegen.set_buildings")}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {t("zonegen.set_totals", { n: countTotal(slots), m: fillCount(slots) })}
        </span>
      </div>

      <label className="flex items-center gap-1 rounded border border-border bg-secondary/40 px-1.5 py-1">
        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("zonegen.set_search")}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </label>

      {full && (
        <p className="text-[10px] text-amber-300">{t("zonegen.set_limit", { max: MAX_SLOTS })}</p>
      )}

      <div className="max-h-40 overflow-y-auto overscroll-contain rounded border border-border/60 bg-secondary/10 p-1">
        {groups.length === 0 && (
          <p className="px-1 py-2 text-[10px] text-muted-foreground">{t("zonegen.set_nothing")}</p>
        )}
        {groups.map(({ effect, items }) => (
          <div key={effect ?? "none"} className="mb-1">
            <p className="px-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(effectKey(effect))}
            </p>
            {items.map((b) => (
              <SettlementSlotRow
                key={b.id}
                building={b}
                slot={slotFor(slots, b.id)}
                onToggle={(on) =>
                  onSlots(on ? setCount(slots, b.id, DEFAULT_COUNT) : dropSlot(slots, b.id))
                }
                onCount={(count) => onSlots(setCount(slots, b.id, count))}
                onFill={(fill) => onSlots(setFill(slots, b.id, fill))}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">{t("zonegen.set_cols")}</p>
    </div>
  );
}
