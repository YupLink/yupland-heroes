// Быстрое пополнение запаса товара (админ): показывает остаток и добавляет N
// единиц кнопкой, не теряя историю продаж (сервер держит потолок GREATEST(sold,
// stock+add)). Обновляет список товаров сразу, без F5.
//
// Шаг со ЗНАКОМ и дробный — как и серверная ручка refillMarketStock. Минус
// убавляет запас, а дробная часть нужна не для красоты: позиции, торговавшие
// десятыми до перехода на целые количества, остались с запасом вроде 7,2, и
// подровнять такой можно только дробным шагом.
//
// У БЕЗЛИМИТНОЙ позиции (stock = null) пополнять нечего, и кнопки тут нет
// вовсе: «пополнить бесконечность» — это на деле «поставить лимит», после чего
// товар с ненулевыми продажами мгновенно уходит в «Распродано». Лимит ставят
// осознанно, полем «Запас» в форме товара, — об этом и говорит подсказка.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageMinus, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { refillMarketStock } from "@/server/api/beta-raid/market-admin";
import type { MarketSide } from "@/lib/marketItem";
import { numTextRu } from "./num";
import { NumField } from "./NumField";
import { invalidateMarketCell } from "./invalidateMarket";

export function MarketStockRefill({
  id,
  q,
  r,
  stock,
  sold,
  side,
}: {
  id: string;
  q: number;
  r: number;
  stock: number | null;
  sold: number;
  /** Скупка: тот же счётчик читается как «сколько ещё примем». */
  side?: MarketSide;
}) {
  const isSell = side === "sell";
  const qc = useQueryClient();
  const [add, setAdd] = useState(10);
  const remaining = stock == null ? null : Math.max(0, stock - sold);

  const refill = useMutation({
    mutationFn: () => refillMarketStock({ data: { id, add } }),
    onSuccess: () => {
      toast.success(add < 0 ? "Запас убавлен" : "Запас обновлён");
      invalidateMarketCell(qc, q, r);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const minus = add < 0;

  // Безлимит: ни поля, ни кнопки — только счётчик оборота и почему кнопки нет.
  // Хуки выше вызваны безусловно, порядок ранним возвратом не ломается.
  if (stock == null) {
    return (
      <div className="mt-1 rounded-lg border border-border bg-background/40 p-2">
        <span className="block truncate text-[11px] text-muted-foreground">
          {isSell
            ? `Без лимита · принято ${numTextRu(sold)}`
            : `Без лимита · продано ${numTextRu(sold)}`}
        </span>
        {/* Поле называем ровно так, как оно подписано в форме ниже: у скупки
            это «Сколько всего примем», у покупки — «Запас». */}
        <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
          Пополнять нечего. Лимит ставится полем «{isSell ? "Сколько всего примем" : "Запас"}» в
          форме ниже.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-border bg-background/40 p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {isSell
            ? `Примем ещё ${numTextRu(remaining ?? 0)} · принято ${numTextRu(sold)}`
            : `Осталось ${numTextRu(remaining ?? 0)} · продано ${numTextRu(sold)}`}
        </span>
        {/* Со знаком и дробью: ручка сервера принимает и то, и другое. */}
        <NumField
          value={add || null}
          onChange={(v) => setAdd(v ?? 0)}
          signed
          placeholder="±"
          className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
        />
        <button
          type="button"
          onClick={() => refill.mutate()}
          disabled={refill.isPending || add === 0}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-gold/40 px-2.5 py-1.5 text-xs font-semibold text-gold disabled:opacity-50"
        >
          {refill.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : minus ? (
            <PackageMinus className="h-3.5 w-3.5" />
          ) : (
            <PackagePlus className="h-3.5 w-3.5" />
          )}
          {minus ? "Убавить" : "Пополнить"}
        </button>
      </div>
      {/* Подсказка короткая нарочно: строка повторяется у КАЖДОГО товара, и
          абзац в три строки превращал список в простыню. */}
      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
        Минус убавляет, дробное можно (−0,2). Ниже проданного не опустится.
      </p>
    </div>
  );
}
