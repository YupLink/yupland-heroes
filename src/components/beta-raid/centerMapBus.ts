// Шина «покажи клетку»: модальные окна над картой (Экономика, Добыча в
// перспективе) кричат «центрируй сюда», а канвас слышит.
//
// Пропсами тянуть через полдюжины слоёв было бы шумно и хрупко: ни рюкзак,
// ни карточка бывшего чужого шага не должны знать про камеру. Здесь — одна
// подписка камеры и навигации. Последняя цель ждёт первого открытия карты.
//
// TTL опционален: 3 000 мс достаточно, чтобы игрок перевёл взгляд с окна на
// клетку; экономика передаёт своё значение явно, встроенное «Добыча» живёт
// на дефолте drawFlash (1 500 мс).

export type CenterRequest = {
  q: number;
  r: number;
  /** Сколько миллисекунд подсвечивать клетку; необязательно. */
  ttlMs?: number;
  /** Keep the expanded camera bounds while the player pans after a tutorial Show. */
  preservePan?: boolean;
};

type Handler = (req: CenterRequest) => void;

const handlers = new Set<Handler>();
const navigationHandlers = new Set<Handler>();
let pending: CenterRequest | null = null;

/** Switch to the world without moving the hero or opening a building. */
export function subscribeCenterNavigation(h: Handler): () => void {
  navigationHandlers.add(h);
  return () => { navigationHandlers.delete(h); };
}

function deliver(req: CenterRequest): void {
  for (const h of handlers) {
    try { h(req); } catch { /* Keep other camera subscribers working. */ }
  }
}


/** Подписаться на запросы центрирования; возвращает функцию отписки. */
export function subscribeCenter(h: Handler): () => void {
  handlers.add(h);
  // Wait until all mount effects finish: the canvas initially centers the hero.
  queueMicrotask(() => {
    if (!handlers.has(h) || !pending) return;
    const req = pending;
    pending = null;
    deliver(req);
  });
  return () => { handlers.delete(h); };
}

/** Отправить запрос «покажи клетку» — все подписчики (обычно один канвас). */
export function requestCenter(req: CenterRequest): void {
  if (!Number.isFinite(req.q) || !Number.isFinite(req.r)) return;
  for (const h of navigationHandlers) {
    try { h(req); } catch { /* A failed screen listener must not block the camera. */ }
  }
  if (handlers.size === 0) {
    pending = req;
    return;
  }
  pending = null;
  deliver(req);
}
