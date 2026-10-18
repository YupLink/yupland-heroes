// Шлагбаум: дверь берёт плату за вход на свою клетку.
//
// Портал сети переносит по кнопке, а дверь (группа 0) стоит поперёк дороги:
// шагнул на её клетку — заплатил. Не хватило денег или не тот герой — шага не
// было вовсе, и энергия не списывается.
//
// Порядок жёсткий: сначала проверки и плата, потом сам шаг. В обратном порядке
// игрок оказывался бы за дверью бесплатно всякий раз, когда оплата падает.
import { nanoid } from "nanoid";
import { heroLevelFits, levelRangeText, moveEnergyFits } from "@/lib/portal";
import { notePricesPaid } from "./econ/trade-hooks";
import type { GateFacts } from "./step-facts";

export type TollPaid = {
  /** Что списали — чтобы вернуть, если сам шаг не удался. */
  refund: () => Promise<void>;
  /** Шаг состоялся — плату в журнал сделок (best-effort, без await). */
  note: () => void;
};

/**
 * Дверь на шаге: взять плату, если она тут стоит.
 *
 * Отдельной функцией, чтобы сам шаг (move-step) остался коротким: там уже
 * шесть волн запросов, и разбор двери прямо в нём делал файл нечитаемым.
 * Героя спрашиваем ТОЛЬКО при живой двери — на обычном гексе это был бы
 * лишний рейс к базе на каждый шаг.
 */
export async function chargeGateOnStep(opts: {
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  gate: GateFacts | null;
}): Promise<TollPaid | null> {
  const gate = opts.gate;
  if (!gate) return null;
  // Бесплатная дверь без ограничения по уровню ничего не решает — не ходим
  // за героем и не платим: лишний рейс к базе на каждом таком шаге.
  const gated = gate.config.levelFromOn || gate.config.levelToOn;
  if (!gated && gate.config.prices.length === 0) return null;

  let heroLevel: number | null = null;
  if (gated) {
    const { selectedHeroRow } = await import("./hero-current");
    const hero = await selectedHeroRow(opts.wallet);
    heroLevel = hero ? Number(hero.level) : null;
  }
  return payGateToll({ ...opts, heroLevel });
}

/**
 * Пропустить через дверь: проверить героя и взять плату.
 *
 * null — двери на клетке нет либо проход бесплатный: возвращать нечего.
 */
export async function payGateToll(opts: {
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  gate: GateFacts | null;
  heroLevel: number | null;
}): Promise<TollPaid | null> {
  const gate = opts.gate;
  if (!gate) return null;

  const cfg = gate.config;
  // Порог по «пройденной» энергии: если задан и не набран — дверь не пустит.
  // Текст с недостачей — тем же способом (ключ словаря, параметры).
  if (cfg.moveEnergyMinOn && cfg.moveEnergyMin > 0) {
    const { moveEnergySpent } = await import("./move-energy-spent");
    const spent = await moveEnergySpent(opts.wallet);
    if (!moveEnergyFits(cfg, spent)) {
      throw new Error(
        `braid.gate_move_energy|${JSON.stringify({
          name: gate.name,
          need: Math.max(0, cfg.moveEnergyMin - spent),
        })}`,
      );
    }
  }
  if (!heroLevelFits(cfg, opts.heroLevel)) {
    // Отказ — КЛЮЧОМ словаря с параметрами: текст игрок читает на своём языке
    // (serverErrorText), а не по-русски посреди английского интерфейса.
    // Границы независимы, поэтому в тексте — готовая строка диапазона
    // («5–10», «5+», «≤ 10»), а не два числа, которых может не быть.
    throw new Error(
      opts.heroLevel == null
        ? `braid.gate_no_hero|${JSON.stringify({ name: gate.name })}`
        : `braid.gate_level|${JSON.stringify({ name: gate.name, range: levelRangeText(cfg) ?? "" })}`,
    );
  }
  if (cfg.prices.length === 0) return null;

  const ref = `gate:${opts.mapId}:${opts.q},${opts.r}:${nanoid(10)}`;
  const { payPortal, refundPortal } = await import("./portal-pay");
  await payPortal(opts.wallet, cfg.prices, ref);
  const { wallet, mapId, q, r } = opts;
  return {
    refund: () => refundPortal(wallet, cfg.prices, ref),
    note: () =>
      void notePricesPaid({ source: "gate", wallet, mapId, q, r, prices: cfg.prices, ref }),
  };
}
