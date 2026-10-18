// Доп. поля товара (админ): запас и опциональная ВТОРАЯ цена (алхимия — платят
// обеими). Вынесено из MarketItemForm ради лимита ≤250 строк. Вторая цена
// переиспользует MarketPriceFields — та же валюта/сумма/токен, без дублирования.
import type { MarketPriceResource } from "@/lib/marketItem";
import { MarketPriceFields } from "./MarketPriceFields";
import { NumField } from "./NumField";

const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function MarketExtraFields({
  sell,
  stock,
  onStock,
  limit,
  onLimit,
  price2Resource,
  price2Amount,
  price2Token,
  tokens,
  onToggle2,
  onPrice2Resource,
  onPrice2Amount,
  onPrice2Token,
}: {
  /** Витрина скупки: «запас» читается как «сколько всего примем». */
  sell?: boolean;
  stock: number | null;
  onStock: (v: number | null) => void;
  /** Лимит на игрока (аккаунт) в день: только у витрины покупки. */
  limit: number | null;
  onLimit: (v: number | null) => void;
  price2Resource: MarketPriceResource | null;
  price2Amount: number | null;
  price2Token: string | null;
  tokens: string[];
  onToggle2: (on: boolean) => void;
  onPrice2Resource: (v: MarketPriceResource) => void;
  onPrice2Amount: (v: number) => void;
  onPrice2Token: (v: string | null) => void;
}) {
  const has2 = price2Resource != null;
  return (
    <>
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
          {sell ? "Сколько всего примем · пусто = без лимита" : "Запас · пусто = без лимита"}
        </span>
        {/* Запас целый: сделка идёт штуками, да и сервер принимает только int
            (upsertMarketItem.stock). Пусто → null, «без лимита». */}
        <NumField
          value={stock}
          onChange={onStock}
          integer
          placeholder="без лимита"
          className={`${inp} tabular-nums`}
        />
      </label>

      {!sell && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Лимит на игрока в день
          </span>
          <NumField
            value={limit}
            onChange={(v) => onLimit(v != null && v > 0 ? v : null)}
            integer
            placeholder="без лимита"
            className={`${inp} tabular-nums`}
          />
        </label>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
        <input
          type="checkbox"
          checked={has2}
          onChange={(e) => onToggle2(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        {sell ? "Добавить вторую выплату (получит обе)" : "Добавить вторую цену (платят обеими)"}
      </label>

      {has2 && (
        <div className="rounded-lg border border-gold/20 bg-gold/5 p-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase text-gold">
            {sell ? "Вторая выплата" : "Вторая цена"}
          </span>
          <MarketPriceFields
            sell={sell}
            noArtAny
            priceResource={price2Resource}
            priceAmount={price2Amount ?? 0}
            priceToken={price2Token}
            tokens={tokens}
            onResource={onPrice2Resource}
            onAmount={onPrice2Amount}
            onToken={onPrice2Token}
          />
        </div>
      )}
    </>
  );
}
