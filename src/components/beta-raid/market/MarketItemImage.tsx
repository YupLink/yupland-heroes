// Картинка позиции витрины с бейджем количества.
//
// ПОЧЕМУ у ресурса знак мельче. Своей картинки у ресурсного товара нет —
// рисуется иконка ресурса, и растянутая на всю плитку молния энергии
// превращала лавку в стену молний. Ресурс — символ, а не постер: рамка
// остаётся квадратной (плитки одного роста, витрина читается одной серией),
// а сам знак занимает три пятых её ширины.
import {useState} from "react";
import type {CSSProperties} from "react";
import {marketImageLayout} from "./marketImageLayout";
import { ShoppingCart } from "lucide-react";
import { thumb } from "@/lib/image";
import { numText } from "./num";
import type { ExchangeEntry } from "./exchange";
import { ArtWearBar } from "@/components/ArtWearBar";

export function MarketItemImage({
  good,
  tone,
  art = false,
  normalize = false,
}: {
  good: ExchangeEntry;
  /** pay — товар уходит от игрока (скупка), get — приходит к нему (покупка). */
  tone: "pay" | "get";
  /** Артефакт: полоса прочности внизу, полная — витрина продаёт новые (и
   *  перепродажу ломбарда — починенной), именная скупка берёт только целые. */
  art?: boolean;
  normalize?: boolean;
}) {
  const src = good.image ? (good.pixel ? good.image : thumb(good.image, 200)) : '';
  const [layout, setLayout] = useState<{src:string;style:CSSProperties}|null>(null);
  return (
    // before — распорка 100 % ширины: старый WebView без aspect-ratio иначе схлопнул
    // бы рамку (картинка в ней абсолютная, в потоке ничего нет).
    <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-border/60 bg-secondary/25 before:block before:pb-[100%] before:content-['']">
      {good.image ? (
        <img
          // Через уменьшающий прокси: плитка меньше сотни пикселей, а арты
          // лежат полноразмерными. Иконки ресурсов локальные — их не трогаем.
          src={src}
          style={normalize && layout?.src === src ? layout.style : undefined}
          onLoad={normalize ? e=>setLayout({src,style:marketImageLayout(e.currentTarget)}) : undefined}
          alt=""
          loading="lazy"
          decoding="async"
          // Абсолютно в рамке: в сетке высота картинки считалась от её же
          // пропорций — высокая (дерево, портрет героя) вылезала за квадрат, и
          // рамка срезала низ («Не влезло», Магазин Саженцев 23.10).
          className={
            good.pixel && !normalize
              ? "absolute inset-0 m-auto h-3/5 w-3/5 object-contain [image-rendering:pixelated]"
              : `absolute inset-0 h-full w-full object-contain${good.pixel ? " [image-rendering:pixelated]" : ""}`
          }
        />
      ) : (
        <ShoppingCart className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />
      )}
      {art && <ArtWearBar durability={100} />}
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
