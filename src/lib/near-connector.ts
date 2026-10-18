import type { NearConnector as NearConnectorType } from "@hot-labs/near-connect";

let instance: Promise<NearConnectorType> | null = null;

// Lazy singleton — the hot-connector library touches window/localStorage at
// construction time, so it can only live on the client. Returns null during
// SSR; callers must handle that.
// Храним ПРОМИС, а не готовый объект: при холодной загрузке страницы его зовут
// сразу несколько мест, и пока шёл import(), каждое создавало свой коннектор —
// подписки висели на одном, connect() шёл через другой.
export async function getConnector(): Promise<NearConnectorType | null> {
  if (typeof window === "undefined") return null;
  instance ??= import("@hot-labs/near-connect")
    .then(({ NearConnector }) => new NearConnector({ network: "mainnet", autoConnect: true }))
    .catch((e: unknown) => {
      instance = null; // упавшая подгрузка не должна залипать навсегда
      throw e;
    });
  return instance;
}

/**
 * Взять подписывающий кошелёк, ПЕРЕПОДКЛЮЧИВ сессию, если она отвалилась.
 * В Telegram-вебвью сессия HOT нередко «протухает» → getConnectedWallet()
 * бросал, а покупка падала с «Сессия кошелька не активна». Теперь при неудаче
 * пробуем connect() (тот же путь, что кнопка «Подключить») и берём кошелёк снова.
 */
export async function getSignerWallet(): Promise<
  Awaited<ReturnType<NearConnectorType["getConnectedWallet"]>>["wallet"]
> {
  const c = await getConnector();
  if (!c) throw new Error("NEAR-кошелёк недоступен");
  try {
    return (await c.getConnectedWallet()).wallet;
  } catch {
    // Сессия отвалилась — переподключаем и пробуем снова.
    try {
      await c.connect();
    } catch {
      throw new Error("Не удалось переподключить кошелёк — открой кошелёк и попробуй ещё раз");
    }
    try {
      return (await c.getConnectedWallet()).wallet;
    } catch {
      throw new Error("Кошелёк не подключён — нажми «Подключить» и повтори покупку");
    }
  }
}

// Подключение кошелька ТОЛЬКО для подписи (кнопка «Забрать излишки NEAR»): мост
// (NearConnectorBridge) на это подключение не входит и не пристёгивает кошелёк к
// Telegram — иначе в браузере вылезала бы лишняя подпись входа и игра
// переключалась бы на подключённый кошелёк. Событие входа приходит чуть позже
// connect(), поэтому метка держится ещё несколько секунд.
let signingOnly = 0;

export async function connectForSigning(): Promise<void> {
  const c = await getConnector();
  if (!c) throw new Error("NEAR-кошелёк недоступен");
  signingOnly++;
  try {
    // Без отключения HOT вернул бы прежний аккаунт и не показал выбор. Мост на
    // отключение больше не реагирует (сессия игры держится на Telegram).
    await c.disconnect().catch(() => {});
    await c.connect();
  } finally {
    setTimeout(() => {
      signingOnly--;
    }, 5000);
  }
}

export const isSigningOnlyConnect = (): boolean => signingOnly > 0;
