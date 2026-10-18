// Валюты ставок аукциона помимо токенов счёта: энергия и ресурсы. Общий модуль
// для сервера (проверка при создании) и клиента (подписи). Коды совпадают с
// SQL-функцией yuplink.auction_money (bid-fn.ts) — менять вместе.
export const AUCTION_SPECIAL_CURRENCIES = [
  { value: "energy", ru: "Энергия", en: "Energy" },
  { value: "res:gold", ru: "Золото", en: "Gold" },
  { value: "res:stone", ru: "Камень", en: "Stone" },
  { value: "res:wood", ru: "Дерево", en: "Wood" },
  { value: "res:diamonds", ru: "Алмазы", en: "Diamonds" },
] as const;

/** Токены, у которых есть человеческое имя. */
const TOKEN_LABELS: Record<string, [string, string]> = { STARS: ["Звёзды", "Stars"] };

/** Подпись валюты лота: «Энергия», «Золото», «Звёзды»; у токена — его символ. */
export function currencyLabel(currency: string, en: boolean): string {
  const s = AUCTION_SPECIAL_CURRENCIES.find((c) => c.value === currency);
  if (s) return en ? s.en : s.ru;
  const t = TOKEN_LABELS[currency];
  return t ? t[en ? 1 : 0] : currency;
}

/** Энергию и ресурсы ставят только целыми. */
export function isWholeOnlyCurrency(currency: string): boolean {
  return currency === "energy" || currency.startsWith("res:");
}

/** Потолок «штук в лоте»: ресурс — до миллиона (как в лоте игрока),
 *  паки, герои и артефакты — до тысячи. Один на форму и сервер. */
export const RESOURCE_QTY_MAX = 1_000_000;
export const PIECE_QTY_MAX = 1000;
