// Что показывает карточка фарма коллекции: накопленное сейчас, полна ли
// копилка, сколько ждать до сбора. Вынесено из CollectionCard.
//
// Потолка копилки нет (владелец, 16.10.2026): билеты копятся, сколько бы суток ни
// прошло, — как и на сервере (chips-farm). capDays приходит только от старого сервера.

const DAY_MS = 86_400_000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type FarmLike = {
  ratePerDay: number;
  accrued: number;
  lastClaimAtMs: number;
  cooldownRemainMs?: number;
  canClaim?: boolean;
  capDays?: number;
};

export function farmView(farm: FarmLike | null, now = Date.now()) {
  const capDays = farm?.capDays ?? null;
  if (!farm) return { accruedNow: 0, capDays, capFull: false, cooldownSec: 0, canClaim: false };
  const capTickets = capDays == null ? Infinity : capDays * farm.ratePerDay;
  const raw =
    farm.lastClaimAtMs && farm.ratePerDay > 0
      ? ((now - farm.lastClaimAtMs) / DAY_MS) * farm.ratePerDay
      : farm.accrued;
  const accruedNow = Math.max(0, Math.min(capTickets, raw));
  const capFull = farm.ratePerDay > 0 && accruedNow >= capTickets - 1e-9;
  // Кулдаун — от сервера (cooldownRemainMs) и локальный посекундный отсчёт для
  // живого таймера: клиент сам по lastClaimAtMs расходился с сервером.
  const serverSec = Math.ceil((farm.cooldownRemainMs ?? 0) / 1000);
  const localSec = farm.lastClaimAtMs
    ? Math.max(0, Math.ceil((farm.lastClaimAtMs + COOLDOWN_MS - now) / 1000))
    : 0;
  const cooldownSec = Math.max(serverSec, localSec);
  const canClaim = farm.ratePerDay > 0 && cooldownSec === 0 && (farm.canClaim ?? true);
  return { accruedNow, capDays, capFull, cooldownSec, canClaim };
}

/** «1:05:09» / «5:09». */
export function fmtCountdown(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
