// Снять героя с грядки издалека: бесплатно, но потом герой отдыхает.
//
// Правило владельца (29.09.2026; 27.09 было «за 10 000 DARAI»): снятие издалека
// бесплатное, после него герой FIELD_RECALL_REST_MS отдыхает — серый, никуда не
// ставится и ничего не делает. У самой грядки — как раньше, даром и без отдыха.
// Число живёт здесь, чтобы кнопка обещала ровно то, что запишет сервер
// (field-recall.ts), а экраны гасили героя до той же минуты.
export const FIELD_RECALL_REST_MS = 3 * 3600_000;

/** Часы отдыха — для кнопки «Снять с работы · отдых 3 ч». */
export const FIELD_RECALL_REST_H = FIELD_RECALL_REST_MS / 3600_000;

/**
 * Отдыхает ли герой в момент now. now === 0 — это SSR: до гидрации ничего не
 * гасим, иначе сервер и клиент нарисуют разное (как chipBusyUntil у фишек).
 */
export function heroResting(restUntil: string | null | undefined, now: number): boolean {
  if (!restUntil || now <= 0) return false;
  const until = Date.parse(restUntil);
  return Number.isFinite(until) && until > now;
}
