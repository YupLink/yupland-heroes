// Клад нашли (lib/treasure, §8.117): «можно забрать только раз — первому, кто его
// нашёл» (владелец 07.11.2026). Найден он тем же оператором, что ставит ямку
// копки (treasure-claim-sql в ground-dig-sql): ямка — одна на клетку.
//
// 08.11.2026 (владелец): «клад должен идти в добычу и его ещё нужно будет забирать»
// — находка кладёт строку «Клад» в «Добычу» (treasure-harvest), приз выдаёт
// «Забрать». Выдача — теми же функциями, что выплаты лавок (market-money.credit),
// ключ `treasure:<id>`. Ресурсы, токены, энергия и артефакт по ключу не
// повторяются — их сначала начисляем, потом ставим отметку. Лайки, пак и свой
// товар по ключу не защищены — сначала отметка со своим ключом вызова (слепой
// повтор запроса узнаёт свою), не прошло — без повтора (не выдать дважды).
// Сбой — сигнал админам один раз.
// Админам — «Клад найден!» и ник, нашедшему — письмо игрового бота; один раз.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { MarketPriceResource } from "@/lib/marketItem";
import { prizeText, type TreasurePrize } from "@/lib/treasure";
import { alertOnce, esc, foundText, sendAdminsText } from "./treasure-tg";

/** Что найдено — для тоста: приз лежит в «Добыче». */
export type TreasureGot = Pick<TreasurePrize, "resource" | "token" | "amount" | "name">;

export const CREDIT_FIRST: ReadonlySet<string> = new Set([
  "gold",
  "diamonds",
  "wood",
  "stone",
  "energy",
  "token",
  "art",
]);

/** Живой клад на клетке — id или null. Сбой чтения — бросок (копка откажет до денег). */
export async function liveTreasureAt(mapId: string, q: number, r: number): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.raid_treasure
      WHERE status = 'live' AND expires_at > now()
        AND map_id = ${sqlStr(mapId)} AND q = ${Math.floor(q)} AND r = ${Math.floor(r)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string }> | null;
  return rows?.[0]?.id ?? null;
}

export type Found = TreasureGot & {
  id: string;
  mapId: string;
  account: string;
  q: number;
  r: number;
  world: string;
  paid: boolean;
  told: boolean;
  nick: string | null;
};

const SELECT = `SELECT t.id, t.map_id, t.found_by, t.q, t.r, t.resource, t.token, t.amount, t.name,
                       t.paid_at IS NOT NULL AS paid, t.found_notified_at IS NOT NULL AS told,
                       COALESCE(NULLIF(m.name, ''), t.map_id) AS world,
                       (SELECT u.telegram_username FROM yuplink.users u
                         WHERE u.account_id = t.found_by AND u.telegram_username IS NOT NULL
                         LIMIT 1) AS nick
                  FROM yuplink.raid_treasure t
                  LEFT JOIN yuplink.raid_maps m ON m.id = t.map_id`;

/** Найденный клад по условию (t.found_op = …, t.id = …). Нет — null. */
export async function foundWhere(where: string): Promise<Found | null> {
  const rows = (await mcpExec(
    `${SELECT} WHERE t.status = 'found' AND t.found_by IS NOT NULL AND ${where} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  const x = rows?.[0];
  if (!x) return null;
  return {
    id: String(x.id),
    mapId: String(x.map_id),
    account: String(x.found_by),
    q: Number(x.q),
    r: Number(x.r),
    resource: String(x.resource) as MarketPriceResource,
    token: typeof x.token === "string" ? x.token : null,
    amount: Number(x.amount),
    name: typeof x.name === "string" ? x.name : null,
    world: String(x.world),
    paid: x.paid === true,
    told: x.told === true,
    nick: typeof x.nick === "string" ? x.nick : null,
  };
}

/**
 * Отметка «взял» со своим ключом вызова: слепой повтор того же текста видит её своей.
 * Ответ — ключ вызова (им отметку можно снять) или null: отметку уже взяли.
 */
async function takeMark(id: string, col: string, opCol: string): Promise<string | null> {
  const me = nanoid(12);
  const rows = (await mcpExec(
    `UPDATE yuplink.raid_treasure SET ${col} = now(), ${opCol} = ${sqlStr(me)}
      WHERE id = ${sqlStr(id)} AND (${col} IS NULL OR ${opCol} = ${sqlStr(me)})
     RETURNING id`,
    { wrapJsonCte: true },
  )) as unknown[] | null;
  return Array.isArray(rows) && rows.length > 0 ? me : null;
}

async function failed(t: Found, e: unknown, retry: boolean): Promise<false> {
  const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
  await mcpExec(
    `UPDATE yuplink.raid_treasure SET pay_error = ${sqlStr(msg)} WHERE id = ${sqlStr(t.id)};`,
  ).catch(() => {});
  const how = retry ? "останется в «Добыче», повтор — следующим «Забрать»" : "повтора не будет";
  // Повод — свой у каждого клада: два зависших не перебивают метку друг друга.
  await alertOnce(
    `pay_${t.id}`,
    t.id,
    `⚠️ Клад ${esc(t.world)} ${t.q},${t.r}: приз «${esc(prizeText(t))}» не выдался (${esc(msg)}) — ${how}.`,
  );
  return false;
}

/**
 * Выдать приз. true — на счёте (сейчас или раньше) или отметка взята и повтора
 * не будет; false — сбой ресурса/токена, его можно повторить.
 */
export async function pay(t: Found, wallet: string): Promise<boolean> {
  const { credit } = await import("@/server/api/beta-raid/market-money");
  const give = () => credit(wallet, t.account, t.resource, t.token, t.amount, `treasure:${t.id}`);
  if (CREDIT_FIRST.has(t.resource)) {
    try {
      await give();
    } catch (e) {
      return failed(t, e, true);
    }
    await mcpExec(
      `UPDATE yuplink.raid_treasure SET paid_at = COALESCE(paid_at, now()), pay_error = NULL
        WHERE id = ${sqlStr(t.id)};`,
    );
    return true;
  }
  const me = await takeMark(t.id, "paid_at", "pay_op");
  if (!me) return true;
  try {
    await give();
  } catch (e) {
    // «Бытовой» отказ (нет героя, полный рюкзак) — ничего не выдано: отметку снять,
    // строка останется в «Добыче» до следующего «Забрать».
    const { isSoftGrantError } = await import("@/server/api/raid-claim-run");
    if (!isSoftGrantError(e)) {
      await failed(t, e, false);
      return true;
    }
    await mcpExec(
      `UPDATE yuplink.raid_treasure SET paid_at = NULL, pay_op = NULL
        WHERE id = ${sqlStr(t.id)} AND pay_op = ${sqlStr(me)};`,
    );
    throw e;
  }
  return true;
}

/** «Клад найден!» админам и письмо нашедшему — один раз, не задерживая ответ игроку. */
export async function tell(t: Found): Promise<void> {
  if (t.told || !(await takeMark(t.id, "found_notified_at", "told_op"))) return;
  void sendAdminsText(foundText(t, t.nick)).catch(() => 0);
  void import("./treasure-dm").then((m) => m.tellFinder(t)).catch(() => false);
}

/**
 * Довести клад, найденный этим нажатием: строка в «Добыче» и письма.
 * Не этим нажатием — null. Ответ — приз для тоста.
 */
export async function settleTreasure(
  op: string,
  _wallet: string,
  _account: string,
): Promise<TreasureGot | null> {
  const t = await foundWhere(`t.found_op = ${sqlStr(op)}`);
  if (!t) return null;
  // Не встала в «Добычу» — встанет обходом расписания (treasure-harvest), тост тот же.
  const { queueTreasure } = await import("./treasure-harvest");
  await queueTreasure(t).catch(() => {});
  await tell(t).catch(() => {});
  return { resource: t.resource, token: t.token, amount: t.amount, name: t.name };
}
