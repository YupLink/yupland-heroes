// Перерисовка кнопки Google без дырки и без скачка (владелец, 09.11.2026: «при
// переключении языков кнопка дёргается — на долю секунды, но заметно»).
//
// Кнопка Google — это сперва запасная кнопка (HTML, 262×40) и iframe
// accounts.google.com/gsi/button размером 0×0. Замер в Chrome: 0 мс — запасная;
// +120 мс — iframe 282×44 ПОД запасной (обе видны, запасная съезжает на 20 px вверх);
// +240 мс — запасная убрана. Два скачка за четверть секунды — это и было «дёргается».
//
// Поэтому новый слой рисуется прозрачным поверх старого (место той же высоты) и
// показывается, только когда iframe получил высоту И рядом с ним не осталось запасной
// (или вышел запас времени — iframe не загрузился, тогда запасная и есть кнопка).
// Прозрачность, а не visibility:hidden: в невидимом слое Chrome iframe не дорисовывает,
// и кнопка ждала бы весь запас, а потом прыгала на виду (замер 09.11.2026).
// Быстрое двойное переключение не даёт двух кнопок: недождавшийся слой убирается.
// Виджету Telegram НЕ годится: две копии с одним id он не держит — новая не рисуется,
// и после замены кнопки не остаётся (проверено на проде 09.11.2026).

const HIDDEN = "position:absolute;inset:0;opacity:0;pointer-events:none";
const POLL_MS = 40;

export type SwapLayer = { layer: HTMLDivElement; dispose: () => void };

/** Кнопка в слое готова: iframe получил высоту и рядом с ним не осталось запасной. */
export function layerReady(layer: HTMLElement): boolean {
  const frame = layer.querySelector("iframe");
  if (!frame || frame.getBoundingClientRect().height <= 0) return false;
  const siblings = Array.from(frame.parentElement?.children ?? []);
  return siblings.every((c) => c === frame || c.getBoundingClientRect().height <= 0);
}

/**
 * Новый слой в host. Первая кнопка (host пуст) видна сразу — ждать её готовности
 * нельзя: у игрока место кнопки пустовало секунды (владелец, 09.11.2026). Следующие
 * (смена языка) — прозрачные поверх старой, показываются готовыми. onShown — слой виден.
 */
export function swapWhenReady(
  host: HTMLElement,
  onShown?: () => void,
  maxWaitMs = 2500,
): SwapLayer {
  // Ждать готовности есть смысл, только если видимая кнопка сама до неё дошла: в
  // браузере, где Google оставляет запасную кнопку, ждать нечего — показать сразу
  // (владелец, 09.11.2026: «при переключении языков ничего не происходит»).
  const shownReady = Array.from(host.children).some((c) => layerReady(c as HTMLElement));
  const layer = document.createElement("div");
  host.appendChild(layer);
  if (!shownReady) {
    for (const c of Array.from(host.children)) if (c !== layer) c.remove();
    onShown?.();
    return { layer, dispose: () => {} };
  }
  layer.style.cssText = HIDDEN;
  layer.setAttribute("aria-hidden", "true");
  let done = false;
  const started = Date.now();
  const show = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    for (const c of Array.from(host.children)) if (c !== layer) c.remove();
    layer.style.cssText = "";
    layer.removeAttribute("aria-hidden");
    onShown?.();
  };
  const timer = setInterval(() => {
    if (layerReady(layer) || Date.now() - started >= maxWaitMs) show();
  }, POLL_MS);
  return {
    layer,
    dispose: () => {
      clearInterval(timer);
      // Не дождался своей очереди — убрать; уже видимый остаётся до следующего.
      if (!done) layer.remove();
      done = true;
    },
  };
}
