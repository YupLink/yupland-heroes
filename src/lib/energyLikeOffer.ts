// «Энергия за лайки»: настройка предложения и суточный счётчик покупок.
//
// Настройка живёт в yuplink.settings под ключом ENERGY_LIKE_OFFER_KEY (JSON):
//   { enabled, amount, steps: [{ amount: цена в лайках, times: сколько раз }] }
// Лестница та же, что у энергопаков: сумма times = сколько раз за UTC-сутки
// можно купить. Ключа нет — дефолт, равный прежнему зашитому поведению
// (+10 энергии за 50 лайков раз в день), чтобы выкатка ничего не поменяла.
//
// Счётчик — в settings `energy_like_daily:<account>`. Старый формат
// 'YYYY-MM-DD' (одна покупка) продолжает читаться: у игроков, купивших
// сегодня до выката, лимит не обнулится.
import { parseSteps, stepsNextPrice, stepsTotal, type CurrencyStep } from "@/lib/energySteps";

export const ENERGY_LIKE_OFFER_KEY = "energy_like_offer";

export type EnergyLikeOffer = {
  enabled: boolean;
  /** Сколько энергии даёт одна покупка. */
  amount: number;
  /** Лестница цен в лайках. */
  steps: CurrencyStep[];
};

/** Потолки для админки — те же держит zod на сервере. */
export const LIKE_OFFER_MAX_AMOUNT = 1000;
export const LIKE_OFFER_MAX_STEPS = 10;
export const LIKE_OFFER_MAX_TIMES = 50;

export const DEFAULT_ENERGY_LIKE_OFFER: EnergyLikeOffer = {
  enabled: true,
  amount: 10,
  steps: [{ amount: 50, times: 1 }],
};

/** Сырое значение настройки → предложение. Мусор и пустота → дефолт по полю. */
export function parseEnergyLikeOffer(raw: string | null | undefined): EnergyLikeOffer {
  if (!raw) return DEFAULT_ENERGY_LIKE_OFFER;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return DEFAULT_ENERGY_LIKE_OFFER;
  }
  if (!obj || typeof obj !== "object") return DEFAULT_ENERGY_LIKE_OFFER;
  const o = obj as { enabled?: unknown; amount?: unknown; steps?: unknown };
  const amount = Math.floor(Number(o.amount));
  const steps = parseSteps(o.steps).slice(0, LIKE_OFFER_MAX_STEPS);
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : DEFAULT_ENERGY_LIKE_OFFER.enabled,
    amount:
      Number.isFinite(amount) && amount > 0 && amount <= LIKE_OFFER_MAX_AMOUNT
        ? amount
        : DEFAULT_ENERGY_LIKE_OFFER.amount,
    steps: steps.length > 0 ? steps : DEFAULT_ENERGY_LIKE_OFFER.steps,
  };
}

/** Сколько раз куплено сегодня по значению счётчика. Чужой день → 0. */
export function parseLikeDaily(value: string | null | undefined, today: string): number {
  if (!value) return 0;
  const [day, n] = value.split(":");
  if (day !== today) return 0;
  if (n === undefined) return 1;
  const c = Math.floor(Number(n));
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/**
 * Значение счётчика после n-й покупки. С меткой операции `op` —
 * 'YYYY-MM-DD:n:op': по ней покупка узнаёт свой слот, когда мост повторил
 * запись вслепую и CAS ответил «ноль строк» уже на повторе. Без метки одна
 * покупка — старый формат.
 */
export function formatLikeDaily(today: string, n: number, op?: string): string {
  if (op) return `${today}:${Math.max(1, n)}:${op}`;
  return n <= 1 ? today : `${today}:${n}`;
}

export type EnergyLikeOfferView = {
  /** Цена следующей покупки; null — на сегодня всё. */
  price: number | null;
  used: number;
  total: number;
};

/** Что видит игрок, купив сегодня `used` раз. */
export function likeOfferView(offer: EnergyLikeOffer, used: number): EnergyLikeOfferView {
  return {
    price: stepsNextPrice(offer.steps, used),
    used,
    total: stepsTotal(offer.steps),
  };
}
