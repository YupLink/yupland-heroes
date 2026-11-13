// Окно поверх карты (aria-modal: банк, аукцион, «Гречка», таверна, выбор места…).
// Карту под ним не видно или она притушена, а её анимации (лагеря онлайн, рябь,
// рыбалка, шаман) будили полный кадр 8 раз в секунду: на телефонах без ускорения
// холста — подвисания и под окном (perf_client 12.11.2026: банк открыт, герой стоит,
// 420 кадров и 50 с подвисаний в минуту). Пока окно открыто — будильник раз в секунду;
// события и ходьба рисуются как обычно.
export const COVERED_DELAY_MS = 1000;

export function mapCovered(): boolean {
  if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return false;
  for (const el of document.querySelectorAll('[aria-modal="true"]'))
    if (el.getClientRects().length > 0) return true;
  return false;
}
