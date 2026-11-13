// Цена «в билетах» платится золотом ×500 (владелец, 20.10.2026, ПРАВИЛА §8.61).
//
// Одна точка пересчёта строки цены — и для списания (resource-pay, рефанд), и
// для подписи (portalPriceText, entryPriceLine), чтобы игрок видел ровно ту
// сумму, которую спишут. В настройках порталов, шлагбаумов, заклинаний,
// кораблей, бустов, Забвения и турниров строка остаётся видом tickets — её
// пересчитывают здесь, базу не переписываем.
import { goldForTicketPrice } from "@/lib/ticketGold";

type PriceRow = { resource: string; amount: number };

/** Строка цены в билетах → та же строка в золоте ×500; прочие — как есть. */
export function ticketRowAsGold<T extends PriceRow>(p: T): T {
  if (p.resource !== "tickets") return p;
  return { ...p, resource: "gold", amount: goldForTicketPrice(Number(p.amount) || 0) } as T;
}
