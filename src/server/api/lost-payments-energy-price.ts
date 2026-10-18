// Минимальная цена пака энергии в конкретной валюте.
//
// Догон не знает, на какой ступени лестницы был игрок в момент оплаты, поэтому
// берёт самую дешёвую ступень этой валюты: заплатил меньше неё — точно не за
// этот пак, заплатил больше — зачитываем.
import { parsePricing, payKey } from "@/lib/energySteps";

type PackRow = {
  price_steps?: unknown;
  price_token_symbol?: string | null;
  price_token_amount?: number | null;
  price_darai?: number | null;
};

export function cheapestPrice(pack: PackRow, symbol: string): number | null {
  const sym = symbol.trim();
  if (!sym) return null;

  const ladder = parsePricing(pack.price_steps);
  // DARAI в лестнице лежит отдельным видом («darai»), а не токеном
  // «token:Darai»: без этой ветки оплата за DARAI не подбиралась ни догоном,
  // ни кнопкой «зачесть» — деньги уходили, энергия не приходила.
  const wanted = sym.toLowerCase() === "darai" ? "darai" : `token:${sym}`;
  const opt =
    ladder.find((o) => payKey(o) === wanted) ??
    ladder.find((o) => payKey(o).toLowerCase() === wanted.toLowerCase());
  if (opt && opt.steps.length > 0) {
    const min = Math.min(...opt.steps.map((s) => Number(s.amount) || Infinity));
    return Number.isFinite(min) ? min : null;
  }

  // Старая одиночная цена — для паков без лестницы.
  if (pack.price_token_symbol === sym && pack.price_token_amount != null) {
    return Number(pack.price_token_amount) || null;
  }
  if (sym.toLowerCase() === "darai" && pack.price_darai != null) {
    return Number(pack.price_darai) || null;
  }
  return null;
}
