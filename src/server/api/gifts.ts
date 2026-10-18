// Подарки игрока: список и клейм.
//
// Подарок — это обещание, а не начисление. Строка лежит в player_gift со
// статусом `pending`, и добро появляется у игрока ровно в тот момент, когда он
// нажал «Забрать». Так у выдачи есть адресат, время и подтверждение, а у
// игрока — понятный экран вместо молча изменившегося баланса.
//
// Захват строки — CAS `status='pending' → 'claimed'` с МЕТКОЙ попытки. Метка
// нужна из-за моста: он повторяет запрос вслепую, и без неё потерянный ответ
// первой попытки оставлял бы подарок навсегда `claimed` с пустыми руками —
// вторая попытка видела занятую строку и отвечала «уже забран».
// Не получилось выдать — возвращаем строку в `pending`, чтобы подарок не сгорел.
//
// Срок: подарок ждёт 48 часов (gifts-expire.ts). Список отдаёт только живые,
// клейм требует живой срок, просроченный переводится в `expired`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { getCurrentWallet } from "../auth";
import { accountIdOf } from "./user-shared";
import { deliverGift, type GiftRow, type GiftKind } from "./gifts-deliver";
import { GIFT_LIVE_SQL, startGiftExpirySweeper, whyNotClaimed } from "./gifts-expire";

export type MyGift = {
  id: string;
  kind: GiftKind;
  amount: number;
  refId: string | null;
  title: string | null;
  image: string | null;
  note: string | null;
  createdAt: string;
  /** Когда сгорит, мс эпохи; null — бессрочный (строки до правила 48 ч). */
  expiresAt: number | null;
};

// Срок отдаём числом, а не timestamptz-строкой: row_to_json пишет шесть знаков
// дробной секунды и смещение, и парсить такое в браузере — лотерея, а Number
// от extract(epoch) стабилен (так же отдаём captured_at шахт).
const SELECT_COLS = `id, account_id, kind, amount, ref_id, title, image, note, status, created_at,
  extract(epoch from expires_at) * 1000 AS expires_ms`;

const expiresAtOf = (r: GiftRow): number | null =>
  r.expires_ms == null ? null : Number(r.expires_ms) || null;

async function myAccount(): Promise<string | null> {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  return accountIdOf(wallet).catch(() => null);
}

/** Мои неполученные подарки. Пусто — кружок на карте не показываем. */
export const getMyGifts = createServerFn({ method: "GET" }).handler(async (): Promise<MyGift[]> => {
  const account = await myAccount();
  if (!account) return [];
  // Зачистка сгоревших стартует лениво, с первого чтения подарков в процессе.
  startGiftExpirySweeper();
  // Часы авторассылок (подписки, «Раздача DARAI») — так же лениво.
  void import("./autodist/tick").then((m) => m.startAutoDistTicker());
  // Часы турниров (очки из журналов, снимки фарма, финиш) — так же лениво.
  void import("./tournament/tour-tick").then((m) => m.startTourTicker());
  // Наступившие дни подписки на энергию — в подарки прямо сейчас.
  const { grantDueForAccount } = await import("./energy-sub/grant");
  await grantDueForAccount(account).catch((e) => console.warn("[esub] выдача дней:", e));
  // Ошибку НЕ глушим: молча отданный пустой список прячет кружок с карты, и
  // игрок уверен, что подарка не было. Пусть лучше запрос честно упадёт и
  // повторится сам.
  const rows = (await mcpExec(
    `SELECT ${SELECT_COLS} FROM yuplink.player_gift
      WHERE account_id = ${sqlStr(account)} AND status = 'pending' AND ${GIFT_LIVE_SQL}
      ORDER BY created_at DESC LIMIT 100;`,
    { wrapJson: true },
  )) as GiftRow[];
  return (rows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount) || 0,
    refId: r.ref_id,
    title: r.title,
    image: r.image,
    note: r.note,
    createdAt: r.created_at,
    expiresAt: expiresAtOf(r),
  }));
});

/**
 * Захватить подарок под выдачу. null — уже забран другим заходом, сгорел или
 * чужой. `op` — метка ЭТОЙ попытки: повтор того же запроса снова получит свою
 * строку, а чужой клейм — нет.
 *
 * Живой срок требуем только от `pending`: повтор с той же меткой обязан
 * получить свою строку и на границе срока — первая попытка выдала в T−1 с,
 * ответ потерялся, повтор пришёл в T+1 с и не должен читать «уже забран».
 */
async function claimRow(account: string, giftId: string, op: string): Promise<GiftRow | null> {
  const rows = (await mcpExec(
    `UPDATE yuplink.player_gift
        SET status = 'claimed', claimed_at = now(), claim_op = ${sqlStr(op)}
      WHERE id = ${sqlStr(giftId)} AND account_id = ${sqlStr(account)}
        AND ((status = 'pending' AND ${GIFT_LIVE_SQL}) OR claim_op = ${sqlStr(op)})
      RETURNING ${SELECT_COLS};`,
    { wrapJsonCte: true },
  ).catch(() => [])) as GiftRow[];
  return rows?.[0] ?? null;
}

/**
 * Вернуть подарок в очередь: выдача сорвалась.
 *
 * Метку попытки снимаем вместе со статусом — иначе следующий клейм получил бы
 * чужой op и не смог бы захватить строку. Повторной выдачи бояться нечего:
 * виды без своего ключа держит gift_deliver_op (gifts-once.ts).
 *
 * Срок при возврате продлеваем хотя бы на час: клейм за минуту до сгорания и
 * упавшая выдача иначе возвращали бы строку в `pending` уже просроченной, и
 * зачистка сжигала бы подарок за ошибку сервера, а не игрока. Бессрочные
 * (NULL) бессрочными и остаются.
 */
async function releaseRow(giftId: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.player_gift SET status = 'pending', claimed_at = NULL, claim_op = NULL,
        expires_at = CASE WHEN expires_at IS NULL THEN NULL
                          ELSE GREATEST(expires_at, now() + interval '1 hour') END
      WHERE id = ${sqlStr(giftId)};`,
  ).catch((e) => console.error(`[gifts] подарок ${giftId} не вернулся в очередь:`, e));
}

export const claimGift = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1).max(64),
        /** Ключ нажатия: одно нажатие — один ключ, повтор запроса — тот же. */
        op: z.string().min(1).max(64).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("gifts.err_no_wallet");
    const account = await accountIdOf(wallet);
    if (!account) throw new Error("gifts.err_no_account");

    // Метка попытки живёт ровно один запрос: клиент шлёт свой ключ, а повтор
    // ТОГО ЖЕ запроса приходит с ним же.
    const op = `${account}:${data.id}:${data.op ?? "1"}`;
    const gift = await claimRow(account, data.id, op);
    if (!gift) throw new Error(`gifts.err_${await whyNotClaimed(account, data.id)}`);
    try {
      await deliverGift(wallet, gift);
    } catch (e) {
      await releaseRow(gift.id);
      throw e;
    }
    return { ok: true as const, kind: gift.kind, amount: Number(gift.amount) || 0 };
  });

/** Забрать все подарки разом. Сбой на одном не роняет остальные. */
export const claimAllGifts = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("gifts.err_no_wallet");
  const account = await accountIdOf(wallet);
  if (!account) throw new Error("gifts.err_no_account");

  const pending = (await mcpExec(
    `SELECT id FROM yuplink.player_gift
      WHERE account_id = ${sqlStr(account)} AND status = 'pending' AND ${GIFT_LIVE_SQL}
      ORDER BY created_at LIMIT 50;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string }>;

  let claimed = 0;
  let failed = 0;
  for (const row of pending ?? []) {
    const gift = await claimRow(account, row.id, `${account}:${row.id}:all`);
    if (!gift) continue;
    try {
      await deliverGift(wallet, gift);
      claimed++;
    } catch (e) {
      await releaseRow(gift.id);
      failed++;
      console.warn(`[gifts] выдача ${gift.id} не прошла:`, e instanceof Error ? e.message : e);
    }
  }
  return { ok: true as const, claimed, failed };
});
