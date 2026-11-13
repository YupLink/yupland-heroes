// Чем платят за энергопак (владелец, 20.10.2026, ПРАВИЛА §8.61): только золото
// (вместо билетов — билетная ступень лестницы, ×500), DARAI и звёзды из Казны.
// USDT, magicdust, RF, HOPE и прочие токены — нет. USDT-лесенка в настройке
// пака остаётся: от её цены считаются звёзды (lib/usdTariff.ts, energySub
// priceIn), но саму оплату USDT ни окно, ни сервер не принимают.

/** Ключ словаря отказа (translations/energy.ts) — переводит serverErrorText/humanError. */
export const ENERGY_PAY_ONLY = "energy.pay_only";

/** Символы счёта, которыми можно оплатить энергопак (кроме золота). */
const ALLOWED = new Set(["darai", "stars"]);

/** Можно ли платить за энергопак этим символом счёта (Darai, STARS). */
export const isEnergyPayAllowed = (symbol: string | null | undefined): boolean =>
  ALLOWED.has(
    String(symbol ?? "")
      .trim()
      .toLowerCase(),
  );

/**
 * Срез для переводов токеном (не DARAI) с memo «buy energy pack …»: блок раньше
 * — это оплата, отправленная ещё при старых правилах, догон её зачтёт; позже —
 * не зачитываем (только лог для ручного разбора). 21.10.2026 00:00 UTC.
 */
export const ENERGY_TOKEN_PAY_CUTOFF_MS = Date.UTC(2026, 9, 21);

/** Зачесть ли on-chain перевод за энергопак: DARAI — всегда, токен — только до среза. */
export const isEnergyTransferAccepted = (
  symbol: string | null | undefined,
  blockMs: number,
): boolean =>
  String(symbol ?? "")
    .trim()
    .replace(/^\$/, "")
    .toLowerCase() === "darai" ||
  (Number.isFinite(blockMs) && blockMs < ENERGY_TOKEN_PAY_CUTOFF_MS);
