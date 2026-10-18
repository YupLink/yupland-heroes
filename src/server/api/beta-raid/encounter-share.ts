// Как делится денежный фонд цели между теми, кто её бил.
//
// Мест в таблице призов обычно больше, чем реальных участников: фонд расписан
// на топ-10, а босса добили вдвоём — 66% фонда просто не выдавались. Теперь
// доли пустующих мест делятся поровну между бившими: у награды нашлись хозяева.
//
// Считает ТОЛЬКО делимое (лайки, билеты, токены, энергия). Паки и предметы
// штучные — их раздача осталась прежней, «до N-го места».
import type { RewardConfig } from "../raid-shared";

export type ShareRow = { kind: string; amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Доля каждого участника в фонде: своё место + равная часть невостребованного.
 *
 * Пример: split [20, 14, …] на 10 мест, бивших двое → по местам уходит 34%,
 * оставшиеся 66% делятся пополам, и участники получают 53% и 47% фонда.
 */
export function participantShares(split: number[], participants: number): number[] {
  if (participants <= 0) return [];
  const sum = split.reduce((a, x) => a + (Number(x) || 0), 0);
  const norm = split.map((x) => (sum > 0 ? (Number(x) || 0) / sum : 0));
  const paidPlaces = Math.min(norm.length, participants);
  const claimed = norm.slice(0, paidPlaces).reduce((a, x) => a + x, 0);
  const orphanEach = Math.max(0, 1 - claimed) / participants;
  return Array.from({ length: participants }, (_, i) => (norm[i] ?? 0) + orphanEach);
}

/**
 * Делимая часть наград по местам: индекс массива — место минус один.
 * Сумма выданного по каждому ресурсу равна фонду: хвост округлений забирает
 * последний участник, иначе фонд «худеет» на копейки.
 */
export function moneyByPlace(cfg: RewardConfig, participants: number): ShareRow[][] {
  const out: ShareRow[][] = Array.from({ length: Math.max(0, participants) }, () => []);
  if (participants <= 0) return out;

  const shares = participantShares(cfg.split, participants);
  for (const fl of cfg.fillers) {
    if (!(fl.amount > 0)) continue;
    const kind = fl.kind === "token" && fl.token ? fl.token : fl.kind;
    let given = 0;
    for (let i = 0; i < participants; i++) {
      const last = i === participants - 1;
      let amt = last ? round2(fl.amount - given) : round2(fl.amount * shares[i]);
      if (given + amt > fl.amount) amt = round2(fl.amount - given);
      if (!(amt > 0)) continue;
      given = round2(given + amt);
      const value = fl.kind === "energy" ? Math.round(amt) : amt;
      if (value > 0) out[i].push({ kind, amount: value });
    }
  }
  return out;
}
