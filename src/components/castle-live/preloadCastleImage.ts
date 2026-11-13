// Одна картинка замка заранее (сцену показываем целиком, а не кусками).
// Сбой одной картинки не роняет весь замок (владелец, 04.11.2026: «баг такой, когда
// открываю замок … иногда приходится раз 10 перезагрузить»):
// - картинка не пришла — ещё попытки через 1 и 3 с;
// - телефон отказался заранее распаковать пришедшую (decode) — не ошибка: она уже
//   пришла и нарисуется и так (на телефонах с кучей вкладок decode отказывает зря).
export const CASTLE_IMAGE_RETRY_MS = [1000, 3000] as const;

type Wait = (ms: number, run: () => void) => void;
const defaultWait: Wait = (ms, run) => void window.setTimeout(run, ms);

/** true — картинка пришла; false — не пришла и после повторов (или экран закрыли). */
export function preloadCastleImage(
  src: string,
  track: (image: HTMLImageElement) => void,
  live: () => boolean,
  wait: Wait = defaultWait,
): Promise<boolean> {
  return new Promise(resolve => {
    const attempt = (n: number) => {
      if (!live()) return resolve(false);
      const image = new Image();
      track(image);
      image.onload = () => {
        const done = () => resolve(true);
        if (typeof image.decode === "function") image.decode().then(done, done);
        else done();
      };
      image.onerror = () => {
        const delay = CASTLE_IMAGE_RETRY_MS[n];
        if (delay === undefined) resolve(false);
        else wait(delay, () => attempt(n + 1));
      };
      image.src = src;
    };
    attempt(0);
  });
}
