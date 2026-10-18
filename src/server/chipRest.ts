// Час отдыха фишки (анти-карусель). При ПЕРЕДАЧЕ фишки другому юзеру (маркет-
// покупка, PvP-победа, ввод NFT-фишки в игру) фишке ставится rest_until = now()+1ч.
// Пока rest_until в будущем — фишка НЕактивна: её нельзя в бой с боссом, в PvP,
// в крафт и на продажу. Пак/прокачка/листинг/вывод-себе — НЕ
// ставят отдых (это не передача между юзерами). См. [[golden-drop-chip-rest-cooldown]].

export const CHIP_REST_MS = 60 * 60 * 1000; // 1 час

/** ISO-время окончания отдыха: сейчас + 1 час. */
export function chipRestUntil(fromMs: number = Date.now()): string {
  return new Date(fromMs + CHIP_REST_MS).toISOString();
}

/** true, если фишка сейчас отдыхает (rest_until в будущем). */
export function isChipResting(restUntil: string | null | undefined): boolean {
  return !!restUntil && new Date(restUntil).getTime() > Date.now();
}

/** PostgREST or-фильтр «фишка НЕ отдыхает» (rest_until null или уже в прошлом). */
export function notRestingOrFilter(now: Date = new Date()): string {
  return `rest_until.is.null,rest_until.lte.${now.toISOString()}`;
}
