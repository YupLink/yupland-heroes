// Карточки «новых построек» Ратуши, которые рисует игра своей карточкой
// (renderService в TownHallScreen), а не макет: номер карточки → id услуги и
// заголовок окна. 12 — Архитектор, 13 — «Управление шахтами» (25.10.2026),
// 15 — «Метеостанция», 16 — «Хижина шаманов» (28.10.2026; 14 — Оружейная
// макета).
const SERVICES: Readonly<Record<number, { id: string; title: string }>> = {
  12: { id: "architect", title: "Архитектор рудников" },
  13: { id: "mine_office", title: "Управление шахтами" },
  15: { id: "weather_station", title: "Метеостанция" },
  16: { id: "shaman_hut", title: "Хижина шаманов" },
  17: { id: "newspaper_kiosk", title: "Газетный киоск" },
};

/** id услуги карточки; не услуга — null. */
export const serviceOf = (card: number | null): string | null =>
  card === null ? null : (SERVICES[card]?.id ?? null);

/** Заголовок окна услуги. */
export const serviceTitle = (card: number | null): string =>
  card === null ? "" : (SERVICES[card]?.title ?? "");

