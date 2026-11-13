// Одна цена в правке админа (окно Архитектора → «Изменить цены»): четыре
// ресурса и строки товаров — товар из списка справочника и сколько штук.
import { Plus, Trash2 } from "lucide-react";
import { ARCHITECT_RES, type ArchitectCost } from "@/lib/castleArchitect";
import { ARCHITECT_GOODS_MAX } from "@/lib/castleArchitectGoods";
import { PriceItemPicker } from "@/components/admin/hex-editor/PriceItemPicker";
import { RES_ICON } from "./architectIcons";
import { addGood, removeGood, setGood, setGoodQty, setRes } from "./architectPriceDraft";

const RES_NAME: Record<(typeof ARCHITECT_RES)[number], [string, string]> = {
  wood: ["Дерево", "Wood"],
  stone: ["Камень", "Stone"],
  gold: ["Золото", "Gold"],
  diamonds: ["Алмазы", "Diamonds"],
};

const field =
  "min-h-11 min-w-0 rounded-lg border border-[#94703c] bg-[#0b1726] px-2 text-base tabular-nums text-[#f5ecda] outline-none focus:border-[#edc36b]";

export function ArchitectPriceBlock({
  ru,
  title,
  cost,
  onChange,
}: {
  ru: boolean;
  title: string;
  cost: ArchitectCost;
  onChange: (next: ArchitectCost) => void;
}) {
  const goods = cost.goods ?? [];
  return (
    <fieldset className="min-w-0 space-y-2 rounded-xl border border-[#ffffff1f] bg-[#0d1b2b] p-3">
      <legend className="px-1 text-sm font-bold text-[#fff0c7]">{title}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ARCHITECT_RES.map((r) => (
          <label key={r} className="flex items-center gap-1.5">
            <img src={RES_ICON[r]} alt="" className="h-6 w-6 shrink-0 object-contain" />
            <input
              inputMode="numeric"
              aria-label={`${title}: ${RES_NAME[r][ru ? 0 : 1]}`}
              className={`${field} w-full`}
              value={String(cost[r])}
              onChange={(e) => onChange(setRes(cost, r, e.target.value))}
            />
          </label>
        ))}
      </div>
      {goods.map((g, i) => (
        <div key={`${i}-${g.key}`} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <PriceItemPicker
              ru={ru}
              itemKey={g.key}
              onPick={(key, name) =>
                onChange(key ? setGood(cost, i, { key, name: name ?? key }) : removeGood(cost, i))
              }
            />
          </div>
          <input
            inputMode="numeric"
            aria-label={ru ? "Сколько штук" : "Quantity"}
            className={`${field} w-16 shrink-0`}
            value={String(g.qty)}
            onChange={(e) => onChange(setGoodQty(cost, i, e.target.value))}
          />
          <button
            type="button"
            data-game-button="icon"
            aria-label={ru ? "Убрать товар" : "Remove item"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#94703c] text-[#e9b9a5]"
            onClick={() => onChange(removeGood(cost, i))}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {goods.length < ARCHITECT_GOODS_MAX && (
        <button
          type="button"
          className="auction-secondary inline-flex min-h-11 items-center gap-1.5"
          onClick={() => onChange(addGood(cost))}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {ru ? "Товар" : "Item"}
        </button>
      )}
    </fieldset>
  );
}
