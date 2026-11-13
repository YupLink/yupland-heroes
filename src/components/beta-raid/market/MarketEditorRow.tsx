// Одна строка списка товаров в админке маркета: иконка, имя, остаток, цена,
// урна с подтверждением и раскрывающаяся форма правки. Вынесено из
// MarketEditor ради лимита ≤250 строк.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Store, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { deleteMarketItem } from "@/server/api/beta-raid/market-admin";
import { RESOURCE_LABELS_RU, type MarketItem } from "@/lib/marketItem";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import { recipeCover } from "@/lib/marketRecipe";
import { MarketItemForm } from "./MarketItemForm";
import { MarketStockRefill } from "./MarketStockRefill";
import { numTextRu } from "./num";
import { invalidateMarketCell } from "./invalidateMarket";

export function MarketEditorRow({
  it,
  q,
  r,
  open,
  onToggle,
  onSaved,
}: {
  it: MarketItem;
  q: number;
  r: number;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);
  const delItem = useMutation({
    mutationFn: () => deleteMarketItem({ data: { id: it.id } }),
    onSuccess: () => {
      setConfirmDel(false);
      // Снятый товар должен пропасть и из витрины игрока, а не только из списка.
      invalidateMarketCell(qc, q, r);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // У ресурсов своей картинки нет — берём иконку ресурса по refId.
  const isRes = !it.image && it.kind === "resource";
  const icon =
    it.image ?? (isRes ? marketResourceIconSrc(it.refId) : it.kind === "recipe" ? recipeCover(it.outcomes) : null);

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background/40 px-2 py-1.5 text-left"
        >
          {icon ? (
            // Ресурс — прозрачный пиксель-арт без рамки-коробки и чётко
            // (pixelated), иначе апскейл мылит. У шаблонных — рамка как была.
            <img
              src={icon}
              alt=""
              className={
                isRes
                  ? "h-7 w-7 shrink-0 object-contain [image-rendering:pixelated]"
                  : "h-7 w-7 shrink-0 rounded border border-border object-contain"
              }
            />
          ) : (
            <div className="grid h-7 w-7 place-items-center rounded border border-border text-muted-foreground">
              <Store className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">
            {it.name || it.kind}
          </span>
          {it.stock != null && (
            <span
              className={`shrink-0 rounded px-1.5 text-[10px] font-semibold tabular-nums ${
                it.stock - it.sold <= 0
                  ? "bg-destructive/15 text-destructive"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {numTextRu(Math.max(0, it.stock - it.sold))}
            </span>
          )}
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {numTextRu(it.priceAmount)}{" "}
            {it.priceResource === "token" ? it.priceToken : RESOURCE_LABELS_RU[it.priceResource]}
          </span>
        </button>
        {/* Удалить товар прямо со строки (магазин можно очистить в ноль). */}
        {confirmDel ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => delItem.mutate()}
              disabled={delItem.isPending}
              aria-label="Удалить"
              className="grid h-8 w-8 place-items-center rounded-lg bg-destructive text-white disabled:opacity-50"
            >
              {delItem.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(false)}
              aria-label="Отмена"
              className="grid h-8 w-8 place-items-center rounded-lg border border-border"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            aria-label="Удалить"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-destructive/40 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1">
          <MarketStockRefill
            id={it.id}
            q={q}
            r={r}
            stock={it.stock}
            sold={it.sold}
            side={it.side}
          />
          <MarketItemForm initial={it} side={it.side} q={q} r={r} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}
