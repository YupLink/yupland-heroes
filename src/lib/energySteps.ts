// Умное предложение энергопака: одно предложение, но с лестницей цен
// ОТДЕЛЬНО ПО КАЖДОЙ ВАЛЮТЕ.
//
// Пример настройки (просьба владельца 21.08):
//   DARAI: 1 млн ×2 раза → потом 5 млн ×2 раза → потом за DARAI нельзя
//   HOPE:  1000 ×1       → потом 2000 ×1       → потом за HOPE нельзя
// Кончились ступени у DARAI — предложение за HOPE ОСТАЁТСЯ активным:
// счётчик покупок ведётся по своей валюте, валюты друг друга не гасят.
//
// Лимит задаётся самой лестницей: сумма times по ступеням валюты = сколько
// раз за день этой валютой можно купить. Ступеней нет — валюта недоступна.

/**
 * Чем платят. Токен опознаётся по символу (HOPE, GDarai, …). `usd` — тариф в $
 * (07.10.2026): ступени в $, платят USDT / DARAI / Stars со счёта по курсу
 * (lib/usdTariff.ts), счётчик покупок у тарифа один на все три валюты.
 */
export type PayKind =
  | { kind: "tickets" }
  | { kind: "darai" }
  | { kind: "usd" }
  | { kind: "token"; symbol: string };

/** Ступень внутри валюты: цена и сколько раз по ней можно купить за день. */
export type CurrencyStep = {
  amount: number;
  /** Сколько покупок по этой цене (по умолчанию 1). */
  times: number;
};

/** Способ оплаты со своей лестницей. */
export type PayOption = PayKind & { steps: CurrencyStep[] };

/** Вся настройка предложения — список способов оплаты. */
export type OfferPricing = PayOption[];

/** Ключ валюты для счётчика покупок: tickets / darai / token:HOPE. */
export function payKey(p: PayKind): string {
  return p.kind === "token" ? `token:${p.symbol}` : p.kind;
}

/** Человеческая подпись валюты. */
export function payName(p: PayKind): string {
  if (p.kind === "tickets") return "билеты";
  if (p.kind === "darai") return "DARAI";
  if (p.kind === "usd") return "$";
  return p.symbol;
}

/** Сколько раз можно купить по лестнице (сумма times). */
export function stepsTotal(steps: CurrencyStep[]): number {
  return steps.reduce((s, st) => s + Math.max(1, Math.floor(st.times || 1)), 0);
}

/**
 * Цена следующей покупки по лестнице: пробегаем ступени, «съедая» уже
 * сделанные покупки. null — ступени на сегодня кончились.
 */
export function stepsNextPrice(steps: CurrencyStep[], bought: number): number | null {
  let left = bought;
  for (const st of steps) {
    const times = Math.max(1, Math.floor(st.times || 1));
    if (left < times) return st.amount;
    left -= times;
  }
  return null;
}

/** Какая по счёту ступень сейчас активна; steps.length — всё выбрано. */
export function stepsIndex(steps: CurrencyStep[], bought: number): number {
  let left = bought;
  for (let i = 0; i < steps.length; i++) {
    const times = Math.max(1, Math.floor(steps[i].times || 1));
    if (left < times) return i;
    left -= times;
  }
  return steps.length;
}

/** Сколько всего покупок за день доступно этой валютой. */
export function totalTimes(opt: PayOption): number {
  return stepsTotal(opt.steps);
}

/** Цена следующей покупки этой валютой (null — за эту валюту на сегодня всё). */
export function nextPrice(opt: PayOption, boughtWithThisCurrency: number): number | null {
  return stepsNextPrice(opt.steps, boughtWithThisCurrency);
}

/** Какая по счёту ступень сейчас активна (для подписи «2 из 3»). */
export function stepIndex(opt: PayOption, bought: number): number {
  return stepsIndex(opt.steps, bought);
}

/** Ступени из сырого jsonb: без цены > 0 — мусор, times не меньше 1. */
export function parseSteps(rawSteps: unknown): CurrencyStep[] {
  if (!Array.isArray(rawSteps)) return [];
  const steps: CurrencyStep[] = [];
  for (const s of rawSteps) {
    const amount = Number((s as { amount?: unknown })?.amount);
    const times = Math.max(1, Math.floor(Number((s as { times?: unknown })?.times) || 1));
    if (Number.isFinite(amount) && amount > 0) steps.push({ amount, times });
  }
  return steps;
}

/** Приводит сырой jsonb из БД к настройке, отбрасывая мусор. */
export function parsePricing(raw: unknown): OfferPricing {
  if (!Array.isArray(raw)) return [];
  const out: OfferPricing = [];
  for (const o of raw) {
    const kind = (o as { kind?: unknown })?.kind;
    const rawSteps = (o as { steps?: unknown })?.steps;
    const steps = parseSteps(rawSteps);
    if (steps.length === 0) continue;
    if (kind === "tickets" || kind === "darai" || kind === "usd") {
      out.push({ kind, steps });
    } else if (kind === "token") {
      const symbol = String((o as { symbol?: unknown })?.symbol ?? "").trim();
      if (symbol) out.push({ kind: "token", symbol, steps });
    }
  }
  return out;
}

/** Найти способ оплаты по валюте. */
export function optionFor(pricing: OfferPricing, pay: PayKind): PayOption | null {
  const key = payKey(pay);
  return pricing.find((o) => payKey(o) === key) ?? null;
}

/**
 * Ключ лестницы тарифа в $: вид `usd`, а если его нет — USDT-лесенка (от её
 * цены считаются звёзды, владелец 07.10.2026: «если $ — от $»). null — у пака
 * цены в $ нет.
 */
export function usdKeyOf(pricing: OfferPricing): string | null {
  if (pricing.some((o) => o.kind === "usd")) return "usd";
  return pricing.some((o) => o.kind === "token" && o.symbol === "USDT") ? "token:USDT" : null;
}
