// «Защита на час» для грибов (владелец, 22.10.2026): «как созревание 1 час
// (даётся сразу же после посадки — может отображаться время, если на него
// нажать — автоскрывается через 5 секунд). при попытке собрать этот гриб — не
// даёт и пишет „гриб ещё не созрел“ … стоит 5 энергии (после размещения
// предложить человеку — человек может отказаться — тогда гриб можно собрать
// сразу другому игроку)».
//
// Защиту предлагают только после ручной посадки; созревание — час от посадки
// (raid_dmine.ripe_at, migrations/mushroom-04). Автопосадка из рюкзака и
// ничейные грибы с жил — без защиты. На добычу и срок жизни не влияет.

/** Цена «Защиты на час», энергии. */
export const MUSHROOM_PROTECT_ENERGY = 5;

/** Сколько длится созревание от посадки. */
export const MUSHROOM_RIPEN_MS = 60 * 60_000;

/** Сколько видна подпись «созреет через» после нажатия. */
export const RIPE_HINT_MS = 5_000;

/** Гриб ещё созревает (ripeAt — мс; нет — защиты нет). */
export const isRipening = (ripeAt: number | null | undefined, now = Date.now()): boolean =>
  typeof ripeAt === "number" && Number.isFinite(ripeAt) && ripeAt > now;

/** Подпись видна: с последнего нажатия прошло меньше RIPE_HINT_MS. */
export const ripeHintShown = (shownAt: number | null, now = Date.now()): boolean =>
  shownAt !== null && now - shownAt >= 0 && now - shownAt < RIPE_HINT_MS;

/** Время из базы (ISO или мс) → мс; не разобрали или уже прошло — null. */
export function ripeAtMs(v: unknown, now = Date.now()): number | null {
  const ms = typeof v === "number" ? v : typeof v === "string" && v ? Date.parse(v) : Number.NaN;
  return isRipening(ms, now) ? ms : null;
}
