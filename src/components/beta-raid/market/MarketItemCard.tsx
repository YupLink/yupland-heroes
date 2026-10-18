// Плитка позиции витрины (игрок): картинка товара с количеством, имя, блок
// обмена «на что меняется», остаток и степпер −/+ снизу. Кнопки сделки у
// плитки НЕТ — берём в «корзину» (qty), а подтверждает всё разом одна кнопка
// внизу MarketAction. Грид 3-в-ряд, компактно под телефон. Хватает ли валюты —
// финально проверяет сервер.
//
// Сторона берётся из самой позиции (it.side): у клетки два независимых списка,
// и карточка знает, в каком стоит.
//   buy  — магазин продаёт: отдаёшь цену, получаешь товар;
//   sell — магазин скупает: отдаёшь товар, получаешь цену.
// Отсюда и раскладка: КАРТИНКА всегда сам товар, а блок под ней подписан тем
// направлением, которого на картинке нет — «Отдаёшь» в покупке (это цена),
// «Получишь» в скупке (это выплата). Одна подпись на плитку: три плитки в ряд,
// и повторять оба слова на каждой — шум.
import { useState } from "react";
import { Flame, Lock, Info } from "lucide-react";
import type { MarketItemView } from "@/lib/buildingEffect";
import { useLang, useT } from "@/lib/i18n";
import { boostListText } from "@/lib/hero/boost";
import { QtyStepper } from "./QtyStepper";
import { numText } from "./num";
import { ItemInfoModal } from "./ItemInfoModal";
import { artPayNeed, artPickMax } from "./artPay";
import { MarketArtPick, type ArtChoice } from "./MarketArtPick";
import { goodEntry, priceEntries } from "./exchange";
import { ExchangeList } from "./ExchangeList";
import { MarketItemImage } from "./MarketItemImage";
// Кап qty — как на сервере (market-qty.QTY_CAP), чтобы «+» не обещал невозможного.
// Живёт рядом с арифметикой потолка, чтобы кнопка и степпер не разошлись.
import { QTY_CAP } from "./useMarketMax";

export function MarketItemCard({
  it,
  qty,
  onQty,
  pick,
  onPick,
  maxAffordable,
}: {
  it: MarketItemView;
  /** Сколько выбрано в корзину (0 = не берём). */
  qty: number;
  onQty: (qty: number) => void;
  /** Какой артефакт игрок отдаёт по позиции «любой арт редкости X». */
  pick?: ArtChoice | null;
  onPick?: (choice: ArtChoice) => void;
  /**
   * Сколько единиц игрок может взять прямо сейчас — под кнопку «Макс».
   * Считает useMarketMax: в скупке по товару на руках, в покупке по деньгам.
   * null — источник неизвестен (паки, герои, именной артефакт), и кнопки тогда
   * нет: обещать наугад хуже, чем не обещать.
   */
  maxAffordable?: number | null;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const [info, setInfo] = useState(false);
  const isSell = it.side === "sell";
  // «Подробности» имеют смысл для того, что несёт статы/бонусы: арт, герой,
  // босс, кастом. У ресурса за иконкой ничего кроме количества — не мучаем.
  const hasDetails =
    !!it.refId &&
    (it.kind === "art" || it.kind === "hero" || it.kind === "boss" || it.kind === "custom");
  // Остаток работает на обеих витринах: у покупки это «сколько ещё продадим»,
  // у скупки — «сколько ещё примем» (лимит выкупа задаёт админ).
  const soldOut = it.remaining != null && it.remaining <= 0;
  // «Любой артефакт редкости X» — и в скупке (это товар), и в покупке (это
  // цена): пока игрок не ткнул, КАКОЙ именно отдаёт, класть позицию в корзину
  // нельзя — иначе сервер забрал бы самый старый свободный, а игрок берёг его.
  const artAny = artPayNeed(it);
  const locked = !it.buyable || soldOut || (artAny != null && !pick);
  // Целых штук, не больше остатка. Округляем ВНИЗ: у позиций, которые торговали
  // десятыми до этой правки, остаток бывает дробным (7,2), и «+» до самого верха
  // положил бы в корзину 7,2 — сервер такое количество уже не принимает.
  // Выбранный артефакт добавляет свой потолок: сдать можно только свободные, и
  // одна единица сделки уносит perUnit штук (artPickMax делит).
  const max = Math.floor(
    Math.min(
      it.remaining == null ? QTY_CAP : it.remaining,
      QTY_CAP,
      pick ? artPickMax(it, pick.count) : QTY_CAP,
    ),
  );
  // «Макс» — всё, что игрок реально потянет: в скупке это товар на руках, в
  // покупке — деньги под цену (обе цены разом, если админ задал алхимию). Ноль
  // оставляем видимым, кнопка просто гаснет: «Макс 0» честно говорит, что
  // сделка сейчас не выйдет.
  const maxPick = maxAffordable ?? null;

  const good = goodEntry(it);
  const prices = priceEntries(t, it);

  return (
    <div
      className={`relative flex flex-col gap-1 rounded-xl border p-1.5 ${
        qty > 0 ? "border-gold/60 bg-gold/10" : "border-border/60 bg-background/40"
      }`}
    >
      <MarketItemImage good={good} tone={isSell ? "pay" : "get"} />

      {hasDetails && (
        <button
          type="button"
          onClick={() => setInfo(true)}
          title={t("market.item_info")}
          className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground backdrop-blur transition hover:text-gold"
        >
          <Info className="h-3 w-3" />
        </button>
      )}

      {/* Имя товара переносится, а не обрывается: «любой обычный артефакт» в
          85 px одной строкой не живёт, а именно оно и есть подпись сделки. */}
      <div
        className="line-clamp-2 break-words text-center text-[11px] font-semibold leading-tight"
        title={good.label}
      >
        {good.label}
      </div>

      {/* Особый спрос города: товара сутки нет — скупает вдвое дороже обычного. */}
      {isSell && it.town?.rush && (
        <div className="flex items-center justify-center gap-0.5 text-center text-[10px] font-bold leading-tight text-orange-400">
          <Flame className="h-3 w-3 shrink-0" />
          {t("market.town_rush")}
        </div>
      )}

      {/* Что даст буст — сразу на плитке. Обычные товары этой строки не имеют
          вовсе: писать «бустов нет» никто не просил. */}
      {!!it.boost?.length && (
        <div className="text-center text-[10px] font-bold leading-tight text-gold">
          {boostListText(it.boost, lang)}
        </div>
      )}

      <ExchangeList
        title={t(isSell ? "market.tile_get" : "market.tile_pay")}
        entries={prices}
        tone={isSell ? "get" : "pay"}
      />

      {/* Низ плитки прижат книзу (mt-auto): у соседей по ряду блок обмена
          разной высоты, и без этого степперы шли лесенкой. */}
      <div className="mt-auto space-y-1 pt-1">
        {/* Остаток / блокировка — одной короткой строкой (место в плитке дорого). */}
        {soldOut ? (
          <div className="text-[10px] font-semibold text-destructive">
            {t(isSell ? "market.buyout_full" : "market.sold_out")}
          </div>
        ) : !it.buyable && it.lockKey ? (
          <div className="flex items-center gap-0.5 text-[9px] font-medium leading-tight text-destructive">
            <Lock className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{t(it.lockKey)}</span>
          </div>
        ) : it.remaining != null ? (
          <div className="text-[10px] text-muted-foreground">
            {t(isSell ? "market.buyout_left" : "market.left", { n: numText(it.remaining) })}
          </div>
        ) : (
          <div className="h-[14px]" />
        )}

        {/* Пикер стоит НАД степпером: пока артефакт не выбран, шагать нечем, и
            подпись кнопки объясняет почему («Выбрать арт» / «Нечего сдать») —
            а не тост после нажатия. */}
        {artAny && onPick && (
          <MarketArtPick rarity={artAny.rarity} value={pick ?? null} onPick={onPick} />
        )}

        <QtyStepper value={qty} min={0} max={max} disabled={locked} onChange={onQty} compact />

        {maxPick != null && !locked && (
          <button
            type="button"
            onClick={() => onQty(maxPick)}
            disabled={maxPick <= 0 || qty === maxPick}
            className="w-full rounded-lg border border-gold/50 bg-gold/10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gold disabled:opacity-40"
          >
            {t("market.max")} {numText(maxPick)}
          </button>
        )}
      </div>

      {info && hasDetails && it.refId && (
        <ItemInfoModal id={it.refId} onClose={() => setInfo(false)} />
      )}
    </div>
  );
}
