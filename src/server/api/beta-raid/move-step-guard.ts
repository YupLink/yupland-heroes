// Сторож шага героя: тормоз частоты по аккаунту и откат брони борта и платы
// двери, когда шаг не применился. Отдельно от move-step.ts — ради лимита строк.
//
// Само «один переход — одно очко и одно списание» держит CAS позиции в
// операторе шага (move-step-sql): пачка одинаковых запросов проходит гейт, но
// применяется ровно один. Тормоз — второй рубеж: последовательный скрипт без
// пауз шагал бы честными шагами в разы быстрее клиента.
import { rateGate } from "@/server/rateGate";
import { STEP_WINDOW_MS, stepRateLimit, type MountTier } from "@/lib/hero/mount";
import { releaseShip, stepOpDone } from "@/server/api/beta-raid/ship-crew";
import type { TollPaid } from "@/server/api/beta-raid/gate-toll";

// Тормоз частоты — ключ АККАУНТ (у аккаунта бывают сёстры-кошельки, и тормоз по
// кошельку делился бы на их число). Окно, а не «N мс от прошлого шага»: запросы
// приходят с разбросом сети, а шаги клиент шлёт пачкой наперёд (§8.84) — жёсткий
// интервал рвал бы маршрут живому игроку (аудит 06.10).

/** Ключ словаря: клиент покажет отказ на языке игрока (serverErrorText). */
export const STEP_TOO_FAST = "braid.step_too_fast";
/** Шаг опоздал: позиция уже не та, с которой он шёл (повтор, вторая вкладка). */
export const STEP_STALE = "braid.step_stale";

/**
 * Порог — по коню героя (§8.84, lib/hero/mount.stepRateLimit): без коня 23 за 3 с,
 * обычный 28, пегас 41. Скрипт быстрее своего коня не побежит.
 */
export function stepRateGate(account: string, tier: MountTier = "none", pct = 0): Promise<void> {
  return rateGate(`step:${account}`, {
    // Зачарованный конь бежит быстрее (§8.84) — и порог выше ровно на столько же.
    limit: stepRateLimit(tier, pct),
    windowMs: STEP_WINDOW_MS,
    message: STEP_TOO_FAST,
  });
}

/**
 * Шаг не применился: снять бронь борта, занятого этим шагом, и вернуть плату
 * двери. Борт у аккаунта один (уникальный индекс по crew_account), так что
 * releaseShip отпускает ровно его.
 */
export async function undoStep(
  wallet: string,
  boarding: boolean,
  toll: TollPaid | null,
): Promise<void> {
  if (boarding) await releaseShip(wallet).catch(() => {});
  await toll?.refund();
}

/**
 * Шаг промахнулся по CAS (moved = 0). Метка его ключа есть — это слепой повтор
 * моста после коммита: переход записан и оплачен один раз, шаг идёт дальше как
 * применённый (без отката борта и платы двери; очко — одно, за этот ключ).
 * Метки нет — позицию уже сдвинул другой запрос: бронь борта и плату двери
 * назад и отказ.
 */
export async function missedStep(o: {
  wallet: string;
  op: string;
  boarding: boolean;
  toll: TollPaid | null;
  sail: boolean;
}): Promise<void> {
  if (await stepOpDone(o.op).catch(() => false)) return;
  await undoStep(o.wallet, o.boarding, o.toll);
  throw new Error(o.sail ? "Корабль туда не пошёл" : STEP_STALE);
}

/** Нехватка энергии — прежними словами (с ценой); прочие сбои — как есть. */
export function stepError(e: unknown, cost: number): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("not_enough_energy")) return new Error(`Недостаточно энергии (нужно ${cost})`);
  // Золото лестницы (§8.121) списывается тем же оператором: «в минус» — не хватает его.
  if (msg.includes("res_move: в минус")) return new Error("braid.ladder_gold");
  return e instanceof Error ? e : new Error(msg);
}
