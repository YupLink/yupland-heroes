// Замок шахтёра (владелец, 09.11.2026, ПРАВИЛА §8.123): герой со способностью
// «Шахтёр» за 40 энергии ставит на СВОЮ шахту замок на 3 часа — её нельзя
// захватить. Только лично, вплотную к шахте. Разрушить шахту и снести охрану
// замок не мешает: он закрывает только сам захват. Один замок на шахту за раз,
// продлить или сложить нельзя — кончился, тогда новый. Замок — хозяина шахты и
// его владения: сменился хозяин (поломка, разборка, снос) — прежний замок больше
// не держит, даже если шахта к нему вернулась.
// Захватчик видит замок в окне шахты вместо кнопки «Захватить».

/** Способность героя, которой доступен замок (lib/hero/heroAbilities). */
export const MINER_ABILITY = "miner";

/** Цена замка в энергии (на острове новичка — со скидкой острова, scaleEnergy). */
export const MINE_WARD_ENERGY = 40;

/** Сколько держит замок, часов. */
export const MINE_WARD_HOURS = 3;

/** Отказы ключами словаря (braid-mine.ts). */
export const WARD_LOCKED = "mine.ward_locked";
export const WARD_ACTIVE = "mine.ward_active";
export const WARD_NOT_YOURS = "mine.ward_not_yours";
export const WARD_NEED_MINER = "mine.ward_need_miner";

/** Отказ базы (raid_mine_ward_put) → ключ словаря; незнакомое — как было. */
export function wardErrorKey(msg: string): string {
  if (/ward_active/.test(msg)) return WARD_ACTIVE;
  if (/ward_not_owner/.test(msg)) return WARD_NOT_YOURS;
  if (/ward_gone/.test(msg)) return "dmine.gone";
  return msg;
}

/** Часы:минуты:секунды до конца замка — «2:59:07», «0:04:30». */
export function wardClock(leftMs: number): string {
  const total = Math.max(0, Math.ceil(leftMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
