// Подсветка элемента экрана для подсказок острова (владелец, 14.10.2026:
// «понравилось, что были подсказки и подсветки — очень важно; ненавязчиво»).
//
// Задание кричит «покажи вот эту кнопку», слой подсветки рисует вокруг неё
// золотое кольцо и короткую подсказку рядом. Шина, а не пропсы: кнопки живут
// в разных углах HUD и замка, тянуть к ним проводки незачем — элемент ищется
// по селектору в момент показа.

export type Spotlight = {
  /** CSS-селектор элемента; первый видимый из списка через запятую. */
  selector: string;
  /** Короткая подсказка рядом с кольцом. */
  text: string;
  /** Надпись кнопки подсказки («Понятно» / «Дальше»). */
  button?: string;
  /** Нажали кнопку подсказки (тур идёт к следующему шагу). */
  onNext?: () => void;
  /** Сколько ждать элемент, мс: окно боя открывают не сразу. */
  waitMs?: number;
  /** Подсветка проходки (useGuideSpot), а не тура: её можно сменить. */
  guide?: boolean;
  /** Игрок нажал саму подсвеченную кнопку. */
  onTap?: () => void;
};

type Handler = (s: Spotlight | null) => void;

const handlers = new Set<Handler>();
let current: Spotlight | null = null;

export function subscribeSpotlight(h: Handler): () => void {
  handlers.add(h);
  h(current);
  return () => {
    handlers.delete(h);
  };
}

export const currentSpotlight = (): Spotlight | null => current;

export function showSpotlight(s: Spotlight | null): void {
  current = s;
  for (const h of handlers) {
    try {
      h(s);
    } catch {
      /* слой подсветки не должен ронять соседей */
    }
  }
}

/** Первый видимый на экране элемент по селектору (кнопка могла быть свёрнута). */
export function findVisible(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let list: NodeListOf<HTMLElement>;
  try {
    list = document.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null;
  }
  for (const el of list) {
    // Скрытый экран (замок под картой и наоборот) — invisible + inert: размер
    // у него есть, а глазам он не виден.
    if (el.closest("[inert]") || getComputedStyle(el).visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}
