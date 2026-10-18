// Картинка позиции витрины с бейджем количества.
//
// ПОЧЕМУ у ресурса знак мельче. Своей картинки у ресурсного товара нет —
// рисуется иконка ресурса, и растянутая на всю плитку молния энергии
// превращала лавку в стену молний. Ресурс — символ, а не постер: рамка
// остаётся квадратной (плитки одного роста, витрина читается одной серией),
// а сам знак занимает три пятых её ширины.
import { ShoppingCart } from "lucide-react";
import { thumb } from "@/lib/image";
import { numText } from "./num";
import type { ExchangeEntry } from "./exchange";

export function MarketItemImage({
  good,
  tone,
}: {
  good: ExchangeEntry;
  /** pay — товар уходит от игрока (скупка), get — приходит к нему (покупка). */
  tone: "pay" | "get";
}) {
  return (
    <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-border/60 bg-secondary/25">
      {good.image ? (
        <img
          // Через уменьшающий прокси: плитка меньше сотни пикселей, а арты
          // лежат полноразмерными. Иконки ресурсов локальные — их не трогаем.
          src={good.pixel ? good.image : thumb(good.image, 200)}
          alt=""
          loading="lazy"
          decoding="async"
          className={
            good.pixel
              ? "h-3/5 w-3/5 object-contain [image-rendering:pixelated]"
              : "h-full w-full object-contain"
          }
        />
      ) : (
        <ShoppingCart className="h-6 w-6 text-muted-foreground" />
      )}
      {/* Ровно одну штуку не подписываем — это и так видно. А вот дробное
          («0,5 энергии») подписать обязаны: у ресурса количество и есть товар. */}
      {good.amount !== 1 && (
        <span
          className={`absolute bottom-0.5 right-0.5 rounded-md bg-background/85 px-1 text-[10px] font-bold tabular-nums backdrop-blur ${
            tone === "pay" ? "text-gold" : "text-emerald-400"
          }`}
        >
          ×{numText(good.amount)}
        </span>
      )}
    </div>
  );
}
