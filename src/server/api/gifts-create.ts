// Завести подарок игроку — единственная дверь, через которую админское добро
// попадает к людям.
//
// Раньше начисления падали прямо в инвентарь и на счёт: игрок узнавал о них
// случайно, а спросить «что это было» было негде. Теперь любая выдача создаёт
// строку в player_gift, и добро появляется в момент клейма (см. gifts.ts).
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import type { GiftKind } from "./gifts-deliver";
import { GIFT_TTL_SQL } from "./gifts-expire";

export type CreateOpts = {
  /**
   * Слать ли письмо получателю. По умолчанию да: подарок, о котором не
   * сказали, игрок не заметит. Массовая раздача шлёт письма сама (ей нужно
   * отметить notified_at и посчитать доставку), поэтому там — false.
   */
  notify?: boolean;
};

export type NewGift = {
  accountId: string;
  kind: GiftKind;
  amount: number;
  /** packId, template_id, символ токена или имя ресурса. */
  refId?: string | null;
  title?: string | null;
  image?: string | null;
  note?: string | null;
  /** Ключ повтора: одна и та же выдача не должна лечь дважды. */
  sourceRef?: string | null;
  createdBy?: string | null;
  /** Не сгорает (оплаченное: набор, выигрыш аукциона). */
  expiresNever?: boolean;
};

const val = (v: string | null | undefined): string => (v ? sqlStr(v) : "NULL");

/**
 * Записать пачку подарков. Возвращает account_id тех, у кого подарок ЕСТЬ —
 * и только что вставленных, и тех, чья строка уже лежала по тому же ключу
 * повтора (слепой ретрай моста, повторное нажатие).
 */
export async function createGifts(list: NewGift[], opts: CreateOpts = {}): Promise<string[]> {
  if (list.length === 0) return [];
  const values = list
    .map(
      (g) =>
        `(${sqlStr(`gft_${nanoid(12)}`)}, ${sqlStr(g.accountId)}, ${sqlStr(g.kind)},
          ${Number(g.amount) || 0}, ${val(g.refId)}, ${val(g.title)}, ${val(g.image)},
          ${val(g.note)}, 'pending', ${val(g.sourceRef)}, ${val(g.createdBy)},
          ${g.expiresNever ? "NULL" : GIFT_TTL_SQL})`,
    )
    .join(",\n");
  // Срок пишем явно, хотя у колонки есть такой же default: наш путь не должен
  // зависеть от того, стоит ли default на этой базе, — правило «48 часов»
  // живёт в коде, default лишь страхует сырые INSERT-ы мимо createGifts.
  const rows = (await mcpExec(
    `INSERT INTO yuplink.player_gift
       (id, account_id, kind, amount, ref_id, title, image, note, status, source_ref, created_by,
        expires_at)
     VALUES ${values}
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING account_id;`,
    { wrapJsonCte: true },
  )) as Array<{ account_id: string }>;
  const written = new Set((rows ?? []).map((r) => r.account_id));

  // RETURNING молчит и когда строка уже была (наш же повтор через мост), и
  // когда её только что вставил кто-то другой. Досматриваем по ключам: иначе
  // «выдалось» читалось бы как «не выдалось» и админ жал бы второй раз.
  const refs = list.map((g) => g.sourceRef).filter((r): r is string => !!r);
  if (refs.length > 0 && written.size < list.length) {
    const found = (await mcpExec(
      `SELECT account_id FROM yuplink.player_gift
        WHERE source_ref IN (${refs.map((r) => sqlStr(r)).join(",")});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ account_id: string }>;
    for (const r of found ?? []) written.add(r.account_id);
  }

  // Письмо шлём только тем, чей подарок ТОЛЬКО ЧТО лёг: повторный вызов с тем
  // же ключом не должен слать второе письмо о том же подарке.
  const fresh = new Set((rows ?? []).map((r) => r.account_id));
  if (opts.notify !== false && fresh.size > 0) {
    const { notifyGifts } = await import("./gifts-notify");
    await notifyGifts([...fresh].map((accountId) => ({ accountId })))
      .then((sent) => {
        // Пишем в лог всегда: «подарок дошёл, а письма нет» иначе выясняется
        // только через жалобу игрока.
        console.log(`[gifts] подарков ${fresh.size}, писем отправлено ${sent}`);
        return sent;
      })
      .catch((e) => {
        console.warn("[gifts] письма не ушли:", e instanceof Error ? e.message : e);
        return 0;
      });
  }
  return [...written];
}

/** Один подарок — обёртка над пачкой, чтобы не городить массив на месте. */
export async function createGift(gift: NewGift, opts: CreateOpts = {}): Promise<boolean> {
  const done = await createGifts([gift], opts);
  return done.length > 0;
}
