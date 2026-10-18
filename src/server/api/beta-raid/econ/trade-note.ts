// Человеческая подпись сделки для ленты игрока: «купил 12 × Молоко у маркета
// (28,45) по 40 gold». Русский здесь намеренно: это данные отчёта для
// владельца в панели «$ Экономика», которая вся на русском (см. ТЗ), а не
// текст интерфейса игрока.
export type TradeNoteInput = {
  source: string;
  side: string;
  itemName: string;
  qty: number;
  priceUnit: number | null;
  priceCur: string | null;
  total: number | null;
  q: number | null;
  r: number | null;
  /** Имя второй стороны, если это игрок (рынок фишек); иначе null. */
  counterpartyName: string | null;
};

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function tradeNote(t: TradeNoteInput): string {
  const place = t.q != null && t.r != null ? ` (${t.q},${t.r})` : "";
  const item = `${fmt(t.qty)} × ${t.itemName}`;
  const cur = t.priceCur ?? "";
  const money = t.total != null && cur ? `${fmt(t.total)} ${cur}` : "";
  const price =
    t.priceUnit != null && cur ? ` по ${fmt(t.priceUnit)} ${cur}` : money ? ` за ${money}` : "";
  const who = t.counterpartyName ?? "игрока";
  switch (t.source) {
    case "market":
      if (t.side === "pay") return `отдал ${item} маркету${place} в обмен`;
      return t.side === "sell"
        ? `продал ${item} маркету${place}${price}`
        : `купил ${item} у маркета${place}${price}`;
    case "market_sell":
      return t.side === "buy"
        ? `получил ${item} от маркета${place} в обмен`
        : `продал ${item} маркету${place}${price}`;
    case "mystic":
      return `получил ${item} из бокса`;
    case "town":
      return t.side === "sell"
        ? `продал ${item} ратуше${place}${price}`
        : `купил ${item} у ратуши${place}${price}`;
    case "chip_market":
      return t.side === "sell"
        ? `продал ${item} ${t.counterpartyName ?? "игроку"}${price}`
        : `купил ${item} у ${who}${price}`;
    case "wh_take":
      return `взял ${item} с общей полки${place}`;
    case "wh_put":
      return `положил ${item} на общую полку${place}`;
    // Плата — строка на каждый ресурс цены: qty — сколько, itemName — чем.
    case "gate":
      return `заплатил ${fmt(t.qty)} ${t.itemName} за ворота${place}`;
    case "portal":
      return `заплатил ${fmt(t.qty)} ${t.itemName} за портал${place}`;
    case "tour":
      return `заплатил ${fmt(t.qty)} ${t.itemName} за запись на турнир${place}`;
    case "field":
      return t.side === "take"
        ? `урожай ${item} лёг в личные ячейки склада${place}`
        : `урожай ${item} ушёл на общую полку склада${place}`;
    case "chest":
      return t.side === "take"
        ? `забрал ${item} из своего сундука${place}`
        : `положил ${item} в свой сундук${place}`;
    // Грабёж: у владельца — всё, что было в сети, у грабителя — что унёс.
    case "chest_plunder":
      return t.side === "pay"
        ? `потерял ${item} — сундук${place} разграбил ${t.counterpartyName ?? "игрок"}`
        : `унёс ${item} из сундука ${who}${place}`;
    case "loot_bag":
      if (t.side === "put") return `положил ${item} в мешочек${place}`;
      return t.counterpartyName
        ? `поднял ${item} из мешочка ${t.counterpartyName}${place}`
        : `забрал ${item} из своего мешочка${place}`;
    case "plain_chest":
      return t.side === "put"
        ? `положил ${item} в общий сундук${place}`
        : `забрал ${item} из общего сундука${place}`;
    case "fish":
      return t.side === "put"
        ? `поймал ${item}${place} — не влезло, мешочком`
        : `поймал ${item}${place}`;
    case "drink":
      return `выпил/съел ${item}`;
    default:
      return `${t.side} ${item}${place}${price}`;
  }
}
