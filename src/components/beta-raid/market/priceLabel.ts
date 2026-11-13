// Подпись цены ОДНОЙ строкой — для сводки корзины, где картинок нет и всё
// сведено по валютам. Плитка витрины цену больше так не пишет: там строки
// обмена с картинками (exchange.ts), которые умеют переноситься.
import type { MarketPriceResource } from "@/lib/marketItem";
import { artAnyRarity } from "./artAnyIcon";
import { numText } from "./num";
import { starsForDarai } from "@/lib/starsForDarai";
import { goldForTicketPrice } from "@/lib/ticketGold";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * «12 золото» / «5 DARAI» — токен показываем символом, ресурс словарём.
 * Сумма бывает дробной («0,1 золота за молоко»), поэтому через numText: голое
 * число писало бы русскому «0.1», а float-хвост — «0.30000000000000004».
 */
export function resPriceText(
  t: Translate,
  amount: number,
  resource: MarketPriceResource,
  token: string | null,
  /** Имя шаблона цены, если сервер его прислал: «1 Слиток железа». */
  name?: string | null,
): string {
  // «Любой артефакт редкости X» — псевдо-шаблон: его id (art_any_common) игроку
  // не говорит ничего, а строка «артефакт art_any_common» в цене выглядела как
  // утёкший в интерфейс идентификатор. Пишем словарём.
  // Звездочнику без DARAI — в звёздах (lib/starsForDarai.ts).
  const stars = resource === "token" && token === "Darai" ? starsForDarai(amount) : null;
  if (stars != null) return `${numText(stars)} ★`;
  // То, что игрок отдаёт «в билетах», берётся золотом ×500 (§8.61).
  if (resource === "tickets")
    return `${numText(goldForTicketPrice(amount))} ${t("market.res.gold")}`;
  const anyArt = resource === "art" ? artAnyRarity(token) : null;
  // У ИМЕНОВАННОГО предмета (конкретный пак/герой/арт/босс/кастом) в token
  // лежит id шаблона — та же утечка, только у обычных позиций: игрок читал
  // «1 артефакт art_GMihRMHltI». Имя шаблона теперь приходит с витриной —
  // берём его; не приехало (старый снимок в кэше) — родовой вид, как было.
  // Токен остаётся символом: он и есть имя.
  const res = anyArt
    ? t(`market.art_any.${anyArt}`)
    : resource === "token"
      ? (token ?? "token")
      : (name ?? t(`market.res.${resource}`));
  return `${numText(amount)} ${res}`;
}
