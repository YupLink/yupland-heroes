// Telegram на телефоне и планшете — рамки Telegram или игра во весь экран.
//
// Планшет (владелец, 22.10.2026): без полного экрана Telegram показывает мини-апп на
// iPad плавающей панелью 390×670 pt, а на Android-планшете — шторкой в 80 % короткой
// стороны — поэтому на планшете по умолчанию во весь экран. Телефон (владелец,
// 30.10.2026): «многим такое не нравится — по умолчанию с рамками», без рамок — по
// выбору в профиле («Рамки Telegram», TgFrameToggle). Во весь экран выводит только
// requestFullscreen (Bot API 8.0+): шапки Telegram с крестиком нет, «Закрыть» и «⋯»
// плавают в верхних углах. ПК-клиенты (tdesktop, macos, web) не трогаем.
//
// Выбор — на устройстве (localStorage): он нужен до первого кадра, а телефон и
// планшет одного игрока могут хотеть разного.
// Класс tg-fs на <html> включает отступ сверху под системную полосу и плавающие
// кнопки Telegram (--app-top, styles: lib/telegram/tg-fullscreen.css).
export type TgFullscreenApi = {
  platform?: string;
  isFullscreen?: boolean;
  isVersionAtLeast?: (version: string) => boolean;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  safeAreaInset?: { top?: number };
  contentSafeAreaInset?: { top?: number };
};

const FRAME_KEY = "gd_tg_frame";

/** Telegram WebApp текущей страницы или undefined (браузер, сервер). */
export function tgWebApp(): TgFullscreenApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TgFullscreenApi } }).Telegram?.WebApp;
}

/** Сколько px сверху занято полосой и кнопками Telegram в полном экране (как --tg-fs-top в CSS); иначе 0. Для окон, которые ставятся скриптом. */
export function tgFullscreenTop(tg: TgFullscreenApi | undefined = tgWebApp()): number {
  if (!tg?.isFullscreen) return 0;
  return (tg.safeAreaInset?.top ?? 0) + (tg.contentSafeAreaInset?.top ?? 0);
}

/** Мобильный клиент Telegram (iOS/Android) — телефон или планшет, размер экрана не важен. */
export function isTgMobileClient(tg: TgFullscreenApi): boolean {
  return tg.platform === "ios" || tg.platform === "android";
}

/** Можно ли здесь выбирать рамки: мобильный Telegram с полным экраном (8.0+). */
export function canToggleTgFrame(tg: TgFullscreenApi | undefined = tgWebApp()): boolean {
  if (!tg || !isTgMobileClient(tg) || typeof tg.requestFullscreen !== "function") return false;
  try {
    return tg.isVersionAtLeast?.("8.0") === true;
  } catch {
    return false;
  }
}

/** Рамки Telegram включены? Выбор игрока, а без него — телефон с рамками, планшет без. */
export function tgFrameOn(): boolean {
  try {
    const v = localStorage.getItem(FRAME_KEY);
    if (v === "on" || v === "off") return v === "on";
  } catch {
    /* хранилище закрыто — как по умолчанию */
  }
  const s = typeof screen === "undefined" ? null : screen;
  return !(s && Math.min(s.width, s.height) >= 600);
}

function apply(tg: TgFullscreenApi, frame: boolean): void {
  try {
    if (!frame && !tg.isFullscreen) tg.requestFullscreen?.();
    if (frame && tg.isFullscreen) tg.exitFullscreen?.();
  } catch {
    // старый клиент или отказ (fullscreenFailed) — остаёмся как есть
  }
}

/** Старт мини-аппа: класс tg-fs следит за полным экраном, без рамок — просим его. */
export function enterMobileFullscreen(tg: TgFullscreenApi): void {
  const sync = () => document.documentElement.classList.toggle("tg-fs", tg.isFullscreen === true);
  tg.onEvent?.("fullscreenChanged", sync);
  sync();
  if (canToggleTgFrame(tg) && !tgFrameOn()) apply(tg, false);
}

/** Переключатель в профиле: запомнить выбор и сразу применить, без перезагрузки. */
export function setTgFrame(frame: boolean, tg: TgFullscreenApi | undefined = tgWebApp()): void {
  try {
    localStorage.setItem(FRAME_KEY, frame ? "on" : "off");
  } catch {
    /* не запомнится — но применится сейчас */
  }
  if (tg && canToggleTgFrame(tg)) apply(tg, frame);
}
