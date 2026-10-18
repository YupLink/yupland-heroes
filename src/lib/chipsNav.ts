// Переход на подвкладку раздела «Фишки» из любого места приложения.
//
// Зачем модуль, а не проп: модалка ввода NFT живёт в StatsBar (шапка страницы),
// а подвкладки — внутри ChipsTab глубоко в main. Общего родителя со стейтом
// нет, а сказать «твои паки вон там» без кнопки-перехода бесполезно: игрок шёл
// в «Фишки» → инвентарь и не находил боксы (они в «Паки»).
//
// Как работает: событие + «отложенный» переход. Если ChipsTab ещё не смонтирован
// (открыта другая вкладка), он заберёт цель при монтировании — takePending().

export type ChipsSubTab = "packs" | "inventory" | "collections" | "items" | "backpack";

const EVENT = "chips:goto-sub";

let pending: ChipsSubTab | null = null;

/** Попросить приложение открыть «Фишки → <sub>». */
export function gotoChipsSub(sub: ChipsSubTab): void {
  pending = sub;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: sub }));
}

/** Забрать отложенную цель (и сбросить её). Зовут при монтировании ChipsTab. */
export function takePendingChipsSub(): ChipsSubTab | null {
  const p = pending;
  pending = null;
  return p;
}

/** Подписка на переход. Возвращает отписку. */
export function onChipsSub(cb: (sub: ChipsSubTab) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = (e: Event) => {
    const sub = (e as CustomEvent<ChipsSubTab>).detail;
    if (sub) cb(sub);
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
