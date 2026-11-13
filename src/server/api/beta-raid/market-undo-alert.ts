// Провал ВОЗВРАТА в маркете — единственная ошибка сделки, которую нельзя
// проглотить молча.
//
// Инвариант проекта: сначала списали, потом выдали; не выдали — вернули. Сам
// возврат тоже может упасть (мост к базе, гонка вкладок, пропавший герой), и
// тогда игрок остаётся без товара и без денег. Ресурс потом можно доначислить
// по леджеру, а артефакт — штучная строка инвентаря: она уже удалена, и
// восстановить её можно ТОЛЬКО по памятке, которую takeArtifacts оставил в
// op-логе (yuplink.raid_backpack_op) строками
// `art:<spendRef>#<ugiId>=<шаблон>=<когда получен>`.
//
// Поэтому здесь два сигнала: заметный TG-алерт админам (тем же трактом, что
// алерты выплат и босса) и console.error с маркером [market-undo] — по нему
// инцидент грепается в логах, даже если бот молчит.
import type { MarketPriceResource } from "@/lib/marketItem";

export type UndoFailure = {
  wallet: string;
  account: string;
  /** Витрина: покупка (возвращали цену) или скупка (возвращали товар). */
  side: "buy" | "sell";
  res: MarketPriceResource;
  token: string | null;
  amount: number;
  /** Ref СПИСАНИЯ — по нему собрана памятка в op-логе (не ref возврата!). */
  spendRef: string;
  /** Ref самого возврата — движение, которого не случилось. */
  undoRef: string;
};

/** Префикс памятки art-списания: строки `<префикс><ugiId>=<шаблон>=<когда получен>`.
 *  Третьей части нет у памяток, записанных до того, как откат стал беречь
 *  место артефакта в очереди FIFO. */
export const artMemoPrefix = (spendRef: string): string => `art:${spendRef}#`;

/** Сколько ждём Telegram, прежде чем отпустить запрос игрока. */
const ALERT_WAIT_MS = 3_000;

/**
 * Подождать отправку, но не дольше ms — и НЕ отменяя её.
 *
 * sendTgMessageToAdmins сначала идёт в базу за списком админов, потом шлёт
 * последовательно, с паузой между адресатами и без таймаута на самом fetch.
 * Пока эта цепочка была в `await`, молчащий Telegram держал экран игрока
 * ровно столько, сколько молчал. Отправку не бросаем: сообщение об инциденте
 * дороже трёх секунд ожидания и уходит в фоне.
 */
function waitAtMost(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[market-undo] алерт админам ещё в пути — игрока не держим");
      resolve();
    }, ms);
    void p.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Никогда не бросает: наверху уже обрабатывают исходную ошибку сделки. */
export async function reportUndoFailure(f: UndoFailure, err: unknown): Promise<void> {
  const memo = f.res === "art" ? artMemoPrefix(f.spendRef) : null;
  console.error("[market-undo] ВОЗВРАТ НЕ ПРОШЁЛ", {
    side: f.side,
    wallet: f.wallet,
    account: f.account,
    res: f.res,
    token: f.token,
    amount: f.amount,
    undoRef: f.undoRef,
    spendRef: f.spendRef,
    memo,
    err: String(err),
  });
  try {
    const { sendTgMessageToAdmins } = await import("../../tg");
    const lines = [
      "🚨 <b>Маркет: возврат не прошёл</b>",
      `Витрина: ${f.side === "buy" ? "покупка" : "скупка"}`,
      `Игрок: <code>${f.wallet}</code> (аккаунт <code>${f.account}</code>)`,
      `Не вернули: ${f.res}${f.token ? ` / ${f.token}` : ""} × ${f.amount}`,
      `Сделка: <code>${f.undoRef}</code>`,
      `Ошибка: ${String(err).slice(0, 200)}`,
    ];
    if (memo) {
      lines.push(
        "",
        "Артефакт удалён из инвентаря и НЕ восстановлен. Что именно ушло — в памятке:",
        `<code>SELECT op FROM yuplink.raid_backpack_op WHERE starts_with(op, '${memo}');</code>`,
        "Строка памятки: <code>&lt;префикс&gt;&lt;id user_game_item&gt;=&lt;шаблон&gt;=&lt;когда получен&gt;=&lt;износ&gt;</code>",
      );
    }
    // Ломбард героев: сданный лежит снимком (hero-pawn-sql) под ключом списания;
    // в сделке из нескольких героев — под «ключ:копия» (hero-pawn-take).
    if (f.res === "hero" && f.token?.startsWith("hero_any_")) {
      lines.push(
        "",
        "Герой снят из инвентаря и НЕ возвращён. Снимки для возврата:",
        `<code>SELECT * FROM yuplink.pawn_hero_take WHERE (op = '${f.spendRef}' OR starts_with(op, '${f.spendRef}:')) AND restored_at IS NULL AND paid_at IS NULL;</code>`,
      );
    }
    const sending = sendTgMessageToAdmins(lines.join("\n")).catch((e) => {
      console.error("[market-undo] алерт админам не ушёл:", e);
    });
    await waitAtMost(sending, ALERT_WAIT_MS);
  } catch (e) {
    console.error("[market-undo] алерт админам не ушёл:", e);
  }
}

/**
 * Обработчик провала возврата для цепочки `.catch()`. spendRef — ref ТОГО
 * списания, что откатываем: у второй цены он свой. undoRef собирается из ref
 * сделки и метки отката. Вынесен из market-buy.ts ради лимита ≤250 строк.
 */
export const undoFailReporter =
  (o: { wallet: string; account: string; side: "buy" | "sell"; payRef: string }) =>
  (res: MarketPriceResource, token: string | null, amount: number, spendRef: string, tag: string) =>
  (e: unknown) =>
    reportUndoFailure(
      {
        wallet: o.wallet,
        account: o.account,
        side: o.side,
        res,
        token,
        amount,
        spendRef,
        undoRef: `${o.payRef}:${tag}`,
      },
      e,
    );
