import { isChipResting } from "../chipRest";

/**
 * Экземпляр фишки для инвентаря — без пустого. «Отдыхает до» и «оглушена до»
 * — только пока действуют (у тысяч фишек там прошедшие даты и null), дата
 * получения — без микросекунд. У крупного игрока 5,7 тыс. фишек: ответ шёл по
 * 300 КБ 12 тыс. раз в сутки (замер 11.10.2026).
 */
export function chipLite(
  r: { id: string; serial_no: number | null; obtained_at: string; rest_until: string | null },
  stun: string | null,
): {
  id: string;
  serialNo: number | null;
  obtainedAt: string;
  restUntil?: string;
  stunUntil?: string;
} {
  const t = new Date(r.obtained_at);
  const out: {
    id: string;
    serialNo: number | null;
    obtainedAt: string;
    restUntil?: string;
    stunUntil?: string;
  } = {
    id: r.id,
    serialNo: r.serial_no,
    obtainedAt: Number.isNaN(t.getTime()) ? r.obtained_at : t.toISOString(),
  };
  if (isChipResting(r.rest_until)) out.restUntil = r.rest_until as string;
  if (stun) out.stunUntil = stun;
  return out;
}
