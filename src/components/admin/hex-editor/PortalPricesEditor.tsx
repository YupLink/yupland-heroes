// Цена прохода через портал: строки «ресурс + сколько». Берутся все разом.
//
// Ресурсы те же, что в маркете: добываемое (золото, камень, дерево, алмазы),
// игровое (лайки, билеты, энергия) и любой токен экосистемы.
//
// Строка переносится на телефоне: селект ресурса, селект токена и поле суммы в
// один ряд не влезали — поле суммы уезжало под корзину и его было не нажать.
import { Plus, Trash2 } from "lucide-react";
import type { PortalPrice } from "@/lib/portal";
import type { MarketPriceResource } from "@/lib/marketItem";
import { PriceItemPicker } from "./PriceItemPicker";

const LABELS: Record<MarketPriceResource | "item", string> = {
  item: "Товар",
  gold: "Золото",
  stone: "Камень",
  wood: "Дерево",
  diamonds: "Алмазы",
  likes: "Лайки",
  tickets: "Билеты",
  energy: "Энергия",
  token: "Токен",
  pack: "Пак",
  hero: "Герой",
  art: "Артефакт",
  boss: "Босс",
  custom: "Свой товар",
};

const RESOURCES = Object.keys(LABELS) as Array<MarketPriceResource | "item">;
const FIELD = "rounded-lg border border-border bg-background px-2 py-1.5 text-xs";

export function PortalPricesEditor({
  prices,
  tokens,
  onChange,
  title = "Стоимость прохода",
  resources = RESOURCES,
  emptyText = "Бесплатно — проход открыт всем.",
}: {
  prices: PortalPrice[];
  tokens: string[];
  onChange: (next: PortalPrice[]) => void;
  /** Тот же редактор строк служит и алтарю-бусту — у него своя подпись. */
  title?: string;
  /** Что можно выбрать. Запись на турнир платится только тем, что умеет
   *  списывать resource-pay (без паков, героев, боссов), — ей список короче. */
  resources?: ReadonlyArray<MarketPriceResource | "item">;
  /** Подпись пустой цены: «проход открыт» у турнира звучало бы не про то. */
  emptyText?: string;
}) {
  const patch = (i: number, p: Partial<PortalPrice>) =>
    onChange(prices.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <button
          type="button"
          onClick={() => onChange([...prices, { resource: "gold", token: null, amount: 0 }])}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <Plus className="h-3 w-3" /> Ресурс
        </button>
      </div>

      {prices.length === 0 && <p className="text-[11px] text-muted-foreground">{emptyText}</p>}

      <div className="space-y-1.5">
        {prices.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <select
              value={p.resource}
              onChange={(e) => {
                const resource = e.target.value as MarketPriceResource | "item";
                patch(i, {
                  resource,
                  token: resource === "token" ? (p.token ?? tokens[0] ?? null) : null,
                  itemKey: resource === "item" ? (p.itemKey ?? null) : null,
                  itemName: resource === "item" ? (p.itemName ?? null) : null,
                });
              }}
              className={`w-[7.5rem] shrink-0 ${FIELD}`}
            >
              {resources.map((r) => (
                <option key={r} value={r}>
                  {LABELS[r]}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={0}
              step="any"
              value={p.amount || ""}
              onChange={(e) => patch(i, { amount: Number(e.target.value) })}
              placeholder="сколько"
              className={`min-w-0 flex-1 ${FIELD}`}
            />

            <button
              type="button"
              onClick={() => onChange(prices.filter((_, j) => j !== i))}
              aria-label="Убрать"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>

            {/* Товар выбираем отдельной строкой — списком своих товаров. */}
            {p.resource === "item" && (
              <PriceItemPicker
                itemKey={p.itemKey}
                onPick={(itemKey, itemName) => patch(i, { itemKey, itemName })}
              />
            )}

            {/* Токен — отдельной строкой: втроём они не помещаются на телефоне,
                и поле суммы уезжало за край. */}
            {p.resource === "token" && (
              <select
                value={p.token ?? ""}
                onChange={(e) => patch(i, { token: e.target.value || null })}
                className={`w-full ${FIELD}`}
              >
                <option value="">— выбери монету —</option>
                {tokens.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
