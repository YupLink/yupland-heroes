// Telegram-helpers: единая точка отправки сообщений из бота.
// Используется в:
//   - api.tg-webhook.ts (ответы юзеру при /start)
//   - broadcast при создании новых дропов/комбо/тикетов
//   - алерты по балансу сервисного кошелька
//
// rate-limit: Telegram Bot API позволяет 30 msg/sec общим лимитом, но при
// массовой рассылке надёжнее не упираться. Используем глобальный sleep
// между сообщениями (~50ms = 20/sec). Это в фоне (fire-and-forget из триггеров).

import { pg } from "./db/pg";

// Хардкод-получатели уведомления «пул закончился». Это TG-ID людей,
// которые отвечают за пополнение сервисного кошелька.
const LOW_BALANCE_RECIPIENTS = [100000002, 100000001];

// URL Mini App. Используется в inline-кнопках чтобы юзер мог открыть
// приложение прямо из ответа бота, не выходя в браузер.
export const WEBAPP_URL = "https://service.yupland.io";

type ReplyMarkup =
  | { inline_keyboard: Array<Array<{ text: string; url?: string; web_app?: { url: string } }>> }
  | undefined;

/**
 * Стандартная кнопка «Открыть приложение» под сообщениями бота.
 * Открывает Mini App inline (без выхода из Telegram).
 *
 * Этот reply_markup автоматически прикрепляется ко всем исходящим
 * сообщениям бота (если caller не передал свой). За счёт этого:
 *   - в превью последнего сообщения в списке диалогов Telegram показывает
 *     синюю кнопку «Открыть» (как у HOT Wallet, NFTSender и т.д.)
 *   - в самом сообщении юзер видит крупную кнопку и сразу открывает Mini App
 *
 * Если нужно отключить — передай `null` в replyMarkup.
 */
export const openAppButton: ReplyMarkup = {
  inline_keyboard: [
    [{ text: "🚀 Открыть приложение", web_app: { url: WEBAPP_URL } }],
  ],
};

/**
 * Кнопка «Открыть приложение» с подмешанным ?ref=<param> в URL.
 * Используется когда юзер пришёл в бота через реф-ссылку
 * (https://t.me/<bot>?start=ref<inviter_tg>) — на старте мы шлём
 * приветствие + эту кнопку, и при открытии mini-app клиент сразу
 * получит ref в URL и передаст в connectWallet.
 */
export function openAppButtonWithRef(refParam: string): ReplyMarkup {
  const url = `${WEBAPP_URL}?ref=${encodeURIComponent(refParam)}`;
  return {
    inline_keyboard: [[{ text: "🚀 Открыть приложение", web_app: { url } }]],
  };
}

// ──────── Bot API generic + Telegram Stars (XTR) ────────
// Тонкая обёртка над Bot API (по образцу tgSendMessage). Возвращает распарсенный
// JSON {ok, result|description}. Для Stars-платежей провайдер НЕ нужен
// (provider_token=""), это единственный разрешённый способ оплаты цифровых
// товаров в Telegram.
export async function tgApi<T = unknown>(
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: "no TELEGRAM_BOT_TOKEN" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!json.ok) console.warn(`tgApi ${method} → ${json.description}`);
    return json;
  } catch (err) {
    console.warn(`tgApi ${method} failed:`, err);
    return { ok: false, description: String(err) };
  }
}

/** Создаёт invoice-ссылку для оплаты Stars (XTR). amountStars — целое число
 *  звёзд. payload ≤ 128 байт (наш идентификатор заказа). Открывается на
 *  клиенте через WebApp.openInvoice(link). */
export async function createStarsInvoiceLink(opts: {
  title: string;
  description: string;
  payload: string;
  amountStars: number;
  label?: string;
}): Promise<string | null> {
  if (!Number.isInteger(opts.amountStars) || opts.amountStars < 1) return null;
  const r = await tgApi<string>("createInvoiceLink", {
    title: opts.title.slice(0, 32),
    description: opts.description.slice(0, 255),
    payload: opts.payload,
    currency: "XTR",
    provider_token: "", // Stars — без провайдера
    prices: [{ label: opts.label ?? opts.title, amount: opts.amountStars }],
  });
  return r.ok ? (r.result ?? null) : null;
}

/** Ответ на pre_checkout_query — ОБЯЗАТЕЛЬНО в течение 10с, иначе платёж
 *  отменяется. ok=false + error_message → показать юзеру причину отказа. */
export async function answerPreCheckoutQuery(
  id: string,
  ok: boolean,
  errorMessage?: string
): Promise<boolean> {
  const r = await tgApi("answerPreCheckoutQuery", {
    pre_checkout_query_id: id,
    ok,
    ...(ok ? {} : { error_message: errorMessage ?? "Платёж недоступен" }),
  });
  if (!r.ok) console.error("answerPreCheckoutQuery FAILED", r.description);
  return r.ok;
}

/** Полный возврат Stars-платежа. Требует telegram_payment_charge_id. */
export async function refundStarPayment(
  userId: number,
  chargeId: string
): Promise<boolean> {
  const r = await tgApi("refundStarPayment", {
    user_id: userId,
    telegram_payment_charge_id: chargeId,
  });
  return r.ok;
}

export async function tgSendMessage(
  chatId: number,
  text: string,
  opts: {
    disableNotification?: boolean;
    replyMarkup?: ReplyMarkup | null;
  } = {}
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  // Default: прикрепляем openAppButton ко ВСЕМ сообщениям. Без этого
  // Telegram не показывает кнопку «Открыть» в превью списка диалогов.
  // Caller может передать null чтобы убрать кнопку, или свою replyMarkup.
  const replyMarkup =
    opts.replyMarkup === null
      ? undefined
      : (opts.replyMarkup ?? openAppButton);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_notification: opts.disableNotification ?? false,
          reply_markup: replyMarkup,
        }),
      }
    );
    // 403 → бот забанен или пользователь удалил чат. Не критично.
    if (!res.ok) {
      console.warn(`tgSendMessage(${chatId}) → ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`tgSendMessage(${chatId}) failed:`, err);
    return false;
  }
}

/**
 * Массовая рассылка с уважением к notifications_enabled.
 * Берёт всех уникальных telegram_id из users с notifications_enabled=true и
 * шлёт сообщение каждому. Между сообщениями ~50ms (≈20/sec) — не упираемся
 * в Telegram-rate-limit.
 *
 * Запускается fire-and-forget из триггеров (не блокирует HTTP-ответ админу).
 */
/**
 * Шлёт сообщение только админам (из ADMIN_WALLETS). Используется для
 * критичных нотификаций (например, лайк-кандидат готов к дропу).
 *
 * Игнорирует флаг notifications_enabled — это служебные алерты.
 */
export async function sendTgMessageToAdmins(
  text: string,
  opts: { replyMarkup?: ReplyMarkup | null } = {}
): Promise<{
  sent: number;
  failed: number;
}> {
  // 1. Жёсткий список TG-id из env ADMIN_TG_IDS — самый надёжный канал,
  //    минует цепочку wallet→user→telegram_id. Поддерживает запятую/пробел.
  const directIds = (process.env.ADMIN_TG_IDS ?? "")
    .split(/[\s,]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  // 2. Fallback / дополнение: telegram_id юзеров с wallet'ом из ADMIN_WALLETS.
  const allowlist = (process.env.ADMIN_WALLETS ?? "demo.near,admin.near")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const admins = await pg.users.raw().select("telegram_id").in("wallet", allowlist);
  const walletDerivedIds = (
    (admins.data ?? []) as Array<{ telegram_id: number | null }>
  )
    .map((r) => r.telegram_id)
    .filter((id): id is number => typeof id === "number");

  const ids = Array.from(new Set([...directIds, ...walletDerivedIds]));
  if (ids.length === 0) {
    console.warn(
      "[tg] sendTgMessageToAdmins: 0 получателей. " +
        "Проверь ADMIN_TG_IDS (приоритетный) или ADMIN_WALLETS env."
    );
  }
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const ok = await tgSendMessage(id, text, { replyMarkup: opts.replyMarkup });
    if (ok) sent++;
    else failed++;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { sent, failed };
}

/**
 * Шлёт фото с подписью одному юзеру. Подпись принимает HTML.
 * Если фото недоступно (404, и т.п.) — Telegram молча игнорит,
 * fallback на текст не делаем (не дублим уведомление).
 */
export async function tgSendPhoto(
  chatId: number,
  photoUrl: string,
  caption: string,
  opts: { replyMarkup?: ReplyMarkup | null } = {}
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("[tgSendPhoto] TELEGRAM_BOT_TOKEN не задан");
    return false;
  }
  // Default reply_markup — кнопка «Открыть приложение», как у обычных сообщений.
  const replyMarkup =
    opts.replyMarkup === null ? undefined : opts.replyMarkup ?? openAppButton;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption,
          parse_mode: "HTML",
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      }
    );
    if (!res.ok) {
      console.warn(`tgSendPhoto(${chatId}) → ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`tgSendPhoto(${chatId}) failed:`, err);
    return false;
  }
}

/**
 * Broadcast фото с подписью всем юзерам с notifications_enabled=true.
 * Если photoUrl пустой — фолбэк на обычный tgBroadcast (text-only).
 */
export async function tgBroadcastPhoto(
  photoUrl: string | null,
  caption: string
): Promise<{ sent: number; failed: number }> {
  if (!photoUrl) return tgBroadcast(caption);
  const recipients = await pg.users.findMany({ notifications_enabled: true });
  const unique = Array.from(
    new Set(
      recipients
        .map((r) => r.telegram_id)
        .filter((id): id is number => typeof id === "number")
    )
  );
  let sent = 0;
  let failed = 0;
  for (const id of unique) {
    const ok = await tgSendPhoto(id, photoUrl, caption);
    if (ok) sent++;
    else failed++;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { sent, failed };
}

export async function tgBroadcast(text: string): Promise<{
  sent: number;
  failed: number;
}> {
  const recipients = await pg.users.findMany({ notifications_enabled: true });
  const unique = Array.from(
    new Set(
      recipients
        .map((r) => r.telegram_id)
        .filter((id): id is number => typeof id === "number")
    )
  );
  let sent = 0;
  let failed = 0;
  for (const id of unique) {
    const ok = await tgSendMessage(id, text);
    if (ok) sent++;
    else failed++;
    // Telegram allows ~30 msg/sec. Sleep чуть больше чтобы не наскочить.
    await new Promise((r) => setTimeout(r, 50));
  }
  return { sent, failed };
}

/**
 * Точечное сообщение конкретному telegramId с проверкой notifications_enabled.
 * Если хоть один user-row с этим TG имеет notificationsEnabled=true — шлём.
 * Если все отключили — пропускаем.
 *
 * Используется для balance-алертов: получатель алерта мог отключить
 * нотификации и тогда мы его не беспокоим.
 */
export async function tgSendIfEnabled(
  telegramId: number,
  text: string
): Promise<boolean> {
  const rows = await pg.users.findMany({ telegram_id: telegramId });
  // Нет user-row с этим TG — это «внешний» получатель.
  if (rows.length > 0 && !rows.some((r) => r.notifications_enabled)) return false;
  return tgSendMessage(telegramId, text);
}

/**
 * Один раз в день (по календарной дате UTC) уведомить «системных» админов
 * (LOW_BALANCE_RECIPIENTS) что пул токена закончился. Триггерится из
 * withdrawTokens когда на сервисном кошельке не хватает баланса.
 *
 * Дедуп через settings: ключ `low_balance_notified.<SYMBOL>` хранит ISO
 * дату последнего уведомления. Сравниваем по YYYY-MM-DD — в пределах
 * одних суток повторно не шлём.
 *
 * notifications_enabled на user-row НЕ проверяется: эти TG-ID хардкод
 * для оперативной работы, отключить может только редактирование кода.
 */
// Порог низкого NEAR-баланса сервисного коша (3 NEAR). Ниже — алерт.
// При 1.5 NEAR кошель уже на грани (storage_deposit новых FT-получателей
// + газ начинают рисковать падать).
const LOW_NEAR_THRESHOLD_YOCTO = 3_000_000_000_000_000_000_000_000n; // 3 NEAR

export async function notifyLowNearDaily(yoctoBalance: string): Promise<void> {
  try {
    const bal = BigInt(yoctoBalance);
    if (bal >= LOW_NEAR_THRESHOLD_YOCTO) return; // OK, не паникуем
    const key = "low_balance_notified.NEAR";
    const today = new Date().toISOString().slice(0, 10);
    const row = await pg.settings.findOne({ key });
    if (row && row.value.slice(0, 10) === today) return; // уже сегодня
    const near = Number(bal / 10n ** 18n) / 1_000_000;
    const text =
      `⚠️ <b>NEAR на сервисном коше заканчивается</b>\n\n` +
      `Текущий баланс: <b>${near.toFixed(3)} NEAR</b>\n` +
      `Порог: 3 NEAR\n\n` +
      `Без NEAR не сможем платить газ за claim'ы и storage_deposit. ` +
      `Пополни darai_gdrop.near.`;
    let anySent = false;
    for (const chatId of LOW_BALANCE_RECIPIENTS) {
      const ok = await tgSendMessage(chatId, text);
      if (ok) anySent = true;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (anySent) {
      await pg.settings.upsert(
        { key, value: new Date().toISOString() },
        { onConflict: "key" }
      );
    }
  } catch (err) {
    console.warn("notifyLowNearDaily failed:", err);
  }
}

export async function notifyLowBalanceDaily(symbol: string): Promise<void> {
  try {
    const key = `low_balance_notified.${symbol}`;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const row = await pg.settings.findOne({ key });
    if (row && row.value.slice(0, 10) === today) return; // уже сегодня шлось

    const text = `Пул "${symbol}" закончился — ожидаю пополнения.`;
    let anySent = false;
    for (const chatId of LOW_BALANCE_RECIPIENTS) {
      const ok = await tgSendMessage(chatId, text);
      if (ok) anySent = true;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (anySent) {
      const now = new Date().toISOString();
      await pg.settings.upsert({ key, value: now }, { onConflict: "key" });
    }
  } catch (err) {
    console.warn(`notifyLowBalanceDaily(${symbol}) failed:`, err);
  }
}
